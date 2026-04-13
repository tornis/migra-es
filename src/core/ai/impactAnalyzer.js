import { createAIClient } from './aiClient.js';
import { loadAIConfig }   from './aiConfig.js';
import {
  checkMemory,
  getCachedChanges,
  saveChangesForPair,
  buildVersionPairs,
} from './breakingChangesMemory.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ImpactAnalyzer');

// ── Prompt builders ────────────────────────────────────────────────────────────

function buildBreakingChangesPrompt(pairs) {
  return `You are an Elasticsearch expert. Your task is to list ALL breaking changes for the following Elasticsearch version transitions: ${pairs.join(', ')}.

For each breaking change, respond with a JSON array. Each item must have these exact fields:
- "versionPair": e.g. "5→6"
- "category": one of "mapping", "settings", "query", "api", "analyzer", "other"
- "severity": one of "critical", "warning", "info"
- "title": short title (max 80 chars)
- "description": detailed explanation
- "affectedFeatures": array of strings (field types, APIs, settings affected)
- "migrationStrategy": concrete steps to address this change

Respond ONLY with a valid JSON array. No markdown, no explanation, no code blocks. Just the raw JSON array.`;
}

function buildIndexAnalysisPrompt(indexName, srcVersion, destVersion, mapping, settings, breakingChanges) {
  const changesJson = JSON.stringify(breakingChanges, null, 2);
  const mappingJson = JSON.stringify(mapping,         null, 2);
  const settingsJson = JSON.stringify(settings,       null, 2);

  return `You are an Elasticsearch migration expert. Analyze the impact of migrating the index described below from ES ${srcVersion} to ES ${destVersion}.

## Index: ${indexName}
## Migration: ES ${srcVersion} → ES ${destVersion}

## Known Breaking Changes (ES ${srcVersion}→${destVersion}):
${changesJson}

## Index Mapping:
${mappingJson}

## Index Settings:
${settingsJson}

## Your Task:
Analyze which breaking changes above DIRECTLY affect this specific index based on its mapping and settings.

Respond in the following structured markdown format:

### 🔴 Critical Issues
List only breaking changes that DIRECTLY impact this index. For each, explain exactly which field/setting is affected and why.

### 🟡 Warnings
Changes that may require attention depending on usage patterns.

### 🟢 Migration Strategy
Step-by-step recommended approach for migrating this specific index safely.

### 📋 Decision
One of: **MIGRATE DIRECTLY** / **REINDEX REQUIRED** / **MANUAL ADJUSTMENTS NEEDED**
Brief justification (2–3 sentences).

Be specific to this index. Do not list breaking changes that do not apply to this mapping/settings.`;
}

// ── JSON extraction helper ─────────────────────────────────────────────────────

function extractJsonArray(text) {
  // Strip markdown code fences if present
  const stripped = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('[');
  const end   = stripped.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array found in response');
  return JSON.parse(stripped.slice(start, end + 1));
}

// ── Main analysis flow ─────────────────────────────────────────────────────────

/**
 * Run a full impact analysis for an index.
 *
 * @param {object}   params
 * @param {string}   params.indexName
 * @param {object}   params.mapping      - From indexManager.getIndexMapping()
 * @param {object}   params.settings     - From indexManager.getIndexSettings()
 * @param {number}   params.srcVersion   - Source ES major version (e.g. 5)
 * @param {number}   params.destVersion  - Destination ES major version (e.g. 9)
 * @param {Function} params.onChunk      - Called with each text delta during streaming
 * @param {Function} params.onStatus     - Called with status strings (e.g. "Checking memory…")
 * @param {Function} params.onComplete   - Called with full analysis text when done
 * @param {Function} params.onError      - Called with Error on failure
 */
export async function analyzeImpact({
  indexName,
  mapping,
  settings,
  srcVersion,
  destVersion,
  onChunk,
  onStatus,
  onComplete,
  onError,
}) {
  try {
    const aiCfg = loadAIConfig();
    const client = createAIClient(aiCfg);

    // ── Step 1: Check breaking changes memory ───────────────────────────────
    onStatus('Checking breaking changes memory…');
    const { cached, missing } = checkMemory(srcVersion, destVersion);
    logger.info('Memory check', { cached, missing });

    // ── Step 2: Fetch missing breaking changes from AI ───────────────────────
    if (missing.length > 0) {
      onStatus(`Fetching breaking changes for: ${missing.join(', ')}…`);

      await new Promise((resolve, reject) => {
        let rawText = '';

        client.streamAnalysis(
          buildBreakingChangesPrompt(missing),
          (chunk) => { rawText += chunk; },
          async (full) => {
            try {
              const allChanges = extractJsonArray(full);

              // Group by versionPair and save each to memory
              for (const pair of missing) {
                const pairChanges = allChanges.filter(c => c.versionPair === pair);
                saveChangesForPair(pair, pairChanges, aiCfg.provider, aiCfg.model);
              }

              logger.info('Breaking changes fetched and saved', { count: allChanges.length });
              resolve();
            } catch (parseErr) {
              logger.warn('Could not parse breaking changes JSON, saving raw', { error: parseErr.message });
              // Save raw text as a single "other" item per pair as fallback
              for (const pair of missing) {
                saveChangesForPair(pair, [{
                  versionPair: pair,
                  category: 'other',
                  severity: 'warning',
                  title: 'Breaking changes (unparsed)',
                  description: full.slice(0, 2000),
                  affectedFeatures: [],
                  migrationStrategy: 'Review the raw response above.',
                }], aiCfg.provider, aiCfg.model);
              }
              resolve();
            }
          },
          (err) => reject(err),
        );
      });
    }

    // ── Step 3: Collect all breaking changes (cached + newly fetched) ────────
    const allPairs      = buildVersionPairs(srcVersion, destVersion);
    const breakingChanges = getCachedChanges(allPairs);
    logger.info('Breaking changes collected', { count: breakingChanges.length });

    // ── Step 4: Stream index-specific impact analysis ────────────────────────
    onStatus(`Analyzing impact on index "${indexName}"…`);

    const analysisPrompt = buildIndexAnalysisPrompt(
      indexName, srcVersion, destVersion,
      mapping, settings, breakingChanges,
    );

    await new Promise((resolve, reject) => {
      client.streamAnalysis(
        analysisPrompt,
        (chunk) => onChunk(chunk),
        (full)  => { onComplete(full); resolve(); },
        (err)   => reject(err),
      );
    });

  } catch (err) {
    logger.error('Impact analysis failed', { error: err.message });
    onError(err);
  }
}
