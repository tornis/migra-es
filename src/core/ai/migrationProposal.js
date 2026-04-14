import { createAIClient } from './aiClient.js';
import { loadAIConfig }   from './aiConfig.js';
import {
  checkMemory,
  getCachedChanges,
  saveChangesForPair,
  buildVersionPairs,
} from './breakingChangesMemory.js';
import { createLogger }  from '../../utils/logger.js';
import { locale }        from '../../i18n/index.js';
import { engineTag, engineName, isCrossSolution } from '../elasticsearch/engineDetector.js';

const logger = createLogger('MigrationProposal');

// ── Language helpers ───────────────────────────────────────────────────────────

function langInstruction() {
  return locale === 'pt-BR'
    ? 'Respond entirely in Brazilian Portuguese (pt-BR).'
    : 'Respond entirely in English.';
}

function langName() {
  return locale === 'pt-BR' ? 'Português Brasileiro' : 'English';
}

// ── Cross-solution context ─────────────────────────────────────────────────────

/**
 * Returns a section describing cross-solution vector field differences
 * to be injected into prompts when srcEngine !== destEngine.
 */
function vectorFieldContext(srcEngine, destEngine) {
  if (!isCrossSolution(srcEngine, destEngine)) return '';

  if (srcEngine === 'elasticsearch' && destEngine === 'opensearch') {
    return `
## Vector / Embedding Field Conversion (Elasticsearch → OpenSearch)
- Elasticsearch uses "dense_vector" with "dims", "index", "similarity" parameters
- OpenSearch uses "knn_vector" with "dimension" and "method" (hnsw/ivf) + "space_type"
- Similarity mapping: cosine → cosinesimil | dot_product → innerproduct | l2_norm → l2
- OpenSearch requires "index.knn: true" in index settings when knn_vector fields are present
- The knn plugin must be enabled in OpenSearch
- Example conversion:
  FROM: { "type": "dense_vector", "dims": 768, "index": true, "similarity": "cosine" }
  TO:   { "type": "knn_vector", "dimension": 768, "method": { "name": "hnsw", "space_type": "cosinesimil", "engine": "nmslib", "parameters": { "ef_construction": 128, "m": 16 } } }
`;
  }

  if (srcEngine === 'opensearch' && destEngine === 'elasticsearch') {
    return `
## Vector / Embedding Field Conversion (OpenSearch → Elasticsearch)
- OpenSearch uses "knn_vector" with "dimension" and "method" (hnsw/ivf) + "space_type"
- Elasticsearch uses "dense_vector" with "dims", "index: true", "similarity" parameters
- Space type mapping: cosinesimil → cosine | innerproduct → dot_product | l2 → l2_norm
- ES dense_vector requires "index: true" to support ANN (approximate nearest neighbor) search
- Remove OpenSearch knn plugin settings from index settings (index.knn, knn.*)
- Example conversion:
  FROM: { "type": "knn_vector", "dimension": 768, "method": { "name": "hnsw", "space_type": "cosinesimil" } }
  TO:   { "type": "dense_vector", "dims": 768, "index": true, "similarity": "cosine" }
`;
  }

  return '';
}

/**
 * Returns cross-solution specific breaking changes context for ES ↔ OS.
 */
function crossSolutionContext(srcEngine, destEngine) {
  if (!isCrossSolution(srcEngine, destEngine)) return '';

  const src = engineName(srcEngine);
  const dst = engineName(destEngine);

  return `
## Cross-Solution Incompatibilities (${src} → ${dst})
IMPORTANT: This is a cross-solution migration. Beyond version breaking changes, consider:

1. PLUGIN DIFFERENCES: ${src} plugins do not exist in ${dst}. Identify any plugin-dependent features.
2. API DIFFERENCES: Some REST API paths, request/response structures differ between solutions.
3. SETTINGS NAMESPACE: Some index settings use solution-specific prefixes. Strip unsupported settings.
4. ANALYZER COMPATIBILITY: Most built-in analyzers are compatible, but verify custom ones.
5. QUERY DSL: Most query types are compatible; vector search requires full rewrite (see below).
6. SECURITY: Authentication, role-mapping, and index-level security differ significantly.
7. TEMPLATES: Legacy index templates (_template) vs composable templates (_index_template) compatibility.

Reference documentation:
- OpenSearch breaking changes: https://docs.opensearch.org/latest/breaking-changes/
- OpenSearch version history: https://docs.opensearch.org/latest/version-history/
- Elasticsearch breaking changes: https://www.elastic.co/docs/release-notes/elasticsearch/breaking-changes
${vectorFieldContext(srcEngine, destEngine)}`;
}

// ── Prompt builders ────────────────────────────────────────────────────────────

function buildBreakingChangesPrompt(pairs, srcEngine, destEngine) {
  const lang    = langInstruction();
  const isCross = isCrossSolution(srcEngine, destEngine);

  const crossPairs = pairs.filter(p => p.includes('→') && !p.includes(':'));
  const samePairs  = pairs.filter(p => p.includes(':'));

  let scope = '';
  if (crossPairs.length > 0) {
    const [crossPair] = crossPairs;
    const [src, dst]  = crossPair.split('→');
    const srcName     = src === 'ES' ? 'Elasticsearch' : 'OpenSearch';
    const dstName     = dst === 'ES' ? 'Elasticsearch' : 'OpenSearch';
    scope += `Cross-solution migration: ${srcName} → ${dstName}. `;
  }
  if (samePairs.length > 0) {
    scope += `Version transitions: ${samePairs.join(', ')}.`;
  }

  return `You are an Elasticsearch/OpenSearch migration expert. ${lang}

List ALL breaking changes for the following migration scope: ${scope}

${isCross ? crossSolutionContext(srcEngine, destEngine) : ''}

Respond ONLY with a valid JSON array. Each item must have:
- "versionPair": the pair key exactly as provided (e.g. "ES:5→6", "ES→OS", "OS:1→2")
- "category": one of "mapping", "settings", "query", "api", "analyzer", "vector", "plugin", "security", "other"
- "severity": one of "critical", "warning", "info"
- "title": short title (max 80 chars)
- "description": detailed explanation
- "affectedFeatures": array of strings
- "migrationStrategy": concrete steps

No markdown, no explanation, no code blocks — just the raw JSON array.`;
}

function buildProposalPrompt(
  indexName, srcEngine, srcVersion, destEngine, destVersion,
  mapping, settings, breakingChanges,
) {
  const lang     = langInstruction();
  const lName    = langName();
  const srcLabel = `${engineName(srcEngine)} ${srcVersion}`;
  const dstLabel = `${engineName(destEngine)} ${destVersion}`;
  const cross    = isCrossSolution(srcEngine, destEngine);

  return `You are a search infrastructure migration expert. ${lang}

Analyze the migration of index "${indexName}" from ${srcLabel} to ${dstLabel}.
${cross ? `\nThis is a CROSS-SOLUTION migration (${engineName(srcEngine)} → ${engineName(destEngine)}).\n` : ''}
## Known Breaking Changes:
${JSON.stringify(breakingChanges, null, 2)}
${cross ? crossSolutionContext(srcEngine, destEngine) : ''}
## Current Mapping (source):
${JSON.stringify(mapping, null, 2)}

## Current Settings (source):
${JSON.stringify(settings, null, 2)}

## Instructions:
Respond with a SINGLE valid JSON object (no markdown fences, no extra text) with these exact fields:

{
  "impactReport": "<markdown report in ${lName} with sections: ### Critical Issues, ### Warnings, ### Summary>",
  "migrationStrategy": "<step-by-step strategy in ${lName}>",
  "decision": "<one of: MIGRATE_DIRECTLY | REINDEX_REQUIRED | MANUAL_ADJUSTMENTS>",
  "criticalIssues": ["<issue 1>"],
  "warnings": ["<warning 1>"],
  "migrationSteps": ["<step 1>"],
  "proposedMapping": {<full corrected mapping compatible with ${engineName(destEngine)} ${destVersion}>},
  "proposedSettings": {<settings compatible with ${engineName(destEngine)} — strip read-only and incompatible fields>},
  "proposedAnalyzers": {<custom analyzers block if present, else {}>},
  "proposedTemplate": {<index template if appropriate, else null>},
  "proposedAliases": [<alias names if appropriate, else []>],
  "vectorFieldsConverted": [{"field": "<name>", "from": "<source type>", "to": "<dest type>"}]
}

CRITICAL RULES:
- proposedMapping must be valid for ${engineName(destEngine)} ${destVersion}
- proposedSettings must only contain writable settings (strip index.creation_date, index.uuid, index.version, index.provided_name)
- Convert "string" types to "text" or "keyword" as appropriate
- Remove "_all", "_timestamp", "_size", "include_in_all" if present${cross ? `
- Convert ALL vector fields: ${srcEngine === 'elasticsearch'
  ? '"dense_vector" (dims/similarity) → "knn_vector" (dimension/method/space_type)'
  : '"knn_vector" (dimension/method) → "dense_vector" (dims/index/similarity)'}${destEngine === 'opensearch'
  ? '\n- Add "index.knn: true" to proposedSettings if any knn_vector fields are present'
  : '\n- Remove "index.knn" and any knn.* settings from proposedSettings'}
- Strip plugin-specific settings that do not exist in ${engineName(destEngine)}` : ''}
- JSON must be parseable — no comments, no trailing commas`;
}

// ── JSON extraction ────────────────────────────────────────────────────────────

function extractJsonObject(text) {
  const stripped = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in AI response');
  return JSON.parse(stripped.slice(start, end + 1));
}

function extractJsonArray(text) {
  const stripped = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('[');
  const end   = stripped.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array found in AI response');
  return JSON.parse(stripped.slice(start, end + 1));
}

// ── Main API ───────────────────────────────────────────────────────────────────

/**
 * Generate a full migration proposal for a single index.
 *
 * @param {object}   params
 * @param {string}   params.indexName
 * @param {object}   params.mapping
 * @param {object}   params.settings
 * @param {string}   [params.srcEngine='elasticsearch']
 * @param {number}   params.srcVersion
 * @param {string}   [params.destEngine='elasticsearch']
 * @param {number}   params.destVersion
 * @param {Function} params.onStatus    - Status updates ("checking_memory" etc.)
 * @param {Function} params.onComplete  - Called with the full proposal object
 * @param {Function} params.onError     - Called with Error
 */
export async function generateMigrationProposal({
  indexName,
  mapping,
  settings,
  srcEngine  = 'elasticsearch',
  srcVersion,
  destEngine = 'elasticsearch',
  destVersion,
  onStatus,
  onComplete,
  onError,
}) {
  try {
    const aiCfg = loadAIConfig();
    const client = createAIClient(aiCfg);

    // ── Step 1: Breaking changes memory ─────────────────────────────────────
    onStatus('checking_memory');
    const { cached, missing } = checkMemory(srcEngine, srcVersion, destEngine, destVersion);
    logger.info('Memory check', { cached, missing, srcEngine, destEngine });

    if (missing.length > 0) {
      onStatus('fetching_breaking_changes');
      await new Promise((resolve, reject) => {
        let rawText = '';
        client.streamAnalysis(
          buildBreakingChangesPrompt(missing, srcEngine, destEngine),
          (chunk) => { rawText += chunk; },
          () => {
            try {
              const allChanges = extractJsonArray(rawText);
              for (const pair of missing) {
                const pairChanges = allChanges.filter(c => c.versionPair === pair);
                saveChangesForPair(pair, pairChanges, aiCfg.provider, aiCfg.model);
              }
              resolve();
            } catch {
              for (const pair of missing) {
                saveChangesForPair(pair, [], aiCfg.provider, aiCfg.model);
              }
              resolve();
            }
          },
          reject,
        );
      });
    }

    // ── Step 2: Collect all breaking changes ─────────────────────────────────
    const allPairs       = buildVersionPairs(srcEngine, srcVersion, destEngine, destVersion);
    const breakingChanges = getCachedChanges(allPairs);

    // ── Step 3: Generate structured proposal ─────────────────────────────────
    onStatus('generating_proposal');
    const prompt = buildProposalPrompt(
      indexName, srcEngine, srcVersion, destEngine, destVersion,
      mapping, settings, breakingChanges,
    );

    await new Promise((resolve, reject) => {
      let rawText = '';
      client.streamAnalysis(
        prompt,
        (chunk) => { rawText += chunk; },
        () => {
          try {
            const proposal = extractJsonObject(rawText);
            proposal.savedAt     = new Date().toISOString();
            proposal.indexName   = indexName;
            proposal.srcEngine   = srcEngine;
            proposal.destEngine  = destEngine;
            proposal.srcVersion  = srcVersion;
            proposal.destVersion = destVersion;
            onComplete(proposal);
            resolve();
          } catch (parseErr) {
            logger.warn('Proposal JSON parse failed, using fallback', { error: parseErr.message });
            onComplete({
              indexName,
              srcEngine,
              destEngine,
              srcVersion,
              destVersion,
              savedAt:              new Date().toISOString(),
              impactReport:         rawText.slice(0, 3000),
              migrationStrategy:    '',
              decision:             'MANUAL_ADJUSTMENTS',
              criticalIssues:       ['Could not parse AI response as JSON'],
              warnings:             [],
              migrationSteps:       [],
              proposedMapping:      mapping,
              proposedSettings:     settings,
              proposedAnalyzers:    {},
              proposedTemplate:     null,
              proposedAliases:      [],
              vectorFieldsConverted: [],
            });
            resolve();
          }
        },
        reject,
      );
    });

  } catch (err) {
    logger.error('Proposal generation failed', { indexName, error: err.message });
    onError(err);
  }
}
