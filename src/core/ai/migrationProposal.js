import { createAIClient } from './aiClient.js';
import { loadAIConfig }   from './aiConfig.js';
import {
  checkMemory,
  getCachedChanges,
  saveChangesForPair,
  buildVersionPairs,
} from './breakingChangesMemory.js';
import { createLogger } from '../../utils/logger.js';
import { locale } from '../../i18n/index.js';

const logger = createLogger('MigrationProposal');

// ── Language helpers ───────────────────────────────────────────────────────────

function langInstruction() {
  return locale === 'pt-BR'
    ? 'Respond entirely in Brazilian Portuguese (pt-BR).'
    : 'Respond entirely in English.';
}

// ── Prompt builders ────────────────────────────────────────────────────────────

function buildBreakingChangesPrompt(pairs) {
  const lang = langInstruction();
  return `You are an Elasticsearch expert. ${lang}

List ALL breaking changes for the following Elasticsearch version transitions: ${pairs.join(', ')}.

Respond ONLY with a valid JSON array. Each item must have:
- "versionPair": e.g. "5→6"
- "category": one of "mapping", "settings", "query", "api", "analyzer", "other"
- "severity": one of "critical", "warning", "info"
- "title": short title (max 80 chars)
- "description": detailed explanation
- "affectedFeatures": array of strings
- "migrationStrategy": concrete steps

No markdown, no explanation, no code blocks — just the raw JSON array.`;
}

function buildProposalPrompt(indexName, srcVersion, destVersion, mapping, settings, breakingChanges) {
  const lang    = langInstruction();
  const langName = locale === 'pt-BR' ? 'Português Brasileiro' : 'English';

  return `You are an Elasticsearch migration expert. ${lang}

Analyze the migration of index "${indexName}" from ES ${srcVersion} to ES ${destVersion}.

## Known Breaking Changes (ES ${srcVersion}→${destVersion}):
${JSON.stringify(breakingChanges, null, 2)}

## Current Mapping:
${JSON.stringify(mapping, null, 2)}

## Current Settings:
${JSON.stringify(settings, null, 2)}

## Instructions:
Respond with a SINGLE valid JSON object (no markdown fences, no extra text) with these exact fields:

{
  "impactReport": "<markdown report in ${langName} with sections: ### Critical Issues, ### Warnings, ### Summary>",
  "migrationStrategy": "<step-by-step strategy in ${langName}>",
  "decision": "<one of: MIGRATE_DIRECTLY | REINDEX_REQUIRED | MANUAL_ADJUSTMENTS>",
  "criticalIssues": ["<issue 1>", "<issue 2>"],
  "warnings": ["<warning 1>"],
  "migrationSteps": ["<step 1>", "<step 2>"],
  "proposedMapping": {<full corrected ES9 mapping — fix all deprecated types, remove unsupported fields>},
  "proposedSettings": {<ES9-compatible settings — remove read-only, version-specific fields>},
  "proposedAnalyzers": {<custom analyzers block if present, else empty object {}>},
  "proposedTemplate": {<index template if appropriate, else null>},
  "proposedAliases": [<alias names if appropriate, else empty array []>]
}

CRITICAL RULES for the proposed artifacts:
- proposedMapping must be a valid ES9 mappings object (with "properties" key)
- proposedSettings must only contain writable settings (no "index.creation_date", "index.uuid", "index.version", "index.provided_name")
- Convert all "string" types to "text" or "keyword" as appropriate
- Remove "_all", "_timestamp", "_size", "include_in_all", "dynamic_templates" if ES5-specific
- proposedAnalyzers should be extracted from settings.index.analysis and placed here separately
- If no changes are needed for a field, keep it as-is
- The JSON must be parseable — no comments, no trailing commas`;
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
 * @param {number}   params.srcVersion
 * @param {number}   params.destVersion
 * @param {Function} params.onStatus    - Status updates ("Fetching breaking changes…")
 * @param {Function} params.onComplete  - Called with the full proposal object
 * @param {Function} params.onError     - Called with Error
 */
export async function generateMigrationProposal({
  indexName,
  mapping,
  settings,
  srcVersion,
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
    const { cached, missing } = checkMemory(srcVersion, destVersion);
    logger.info('Memory check', { cached, missing });

    if (missing.length > 0) {
      onStatus('fetching_breaking_changes');
      await new Promise((resolve, reject) => {
        let rawText = '';
        client.streamAnalysis(
          buildBreakingChangesPrompt(missing),
          (chunk) => { rawText += chunk; },
          () => {
            try {
              const allChanges = extractJsonArray(rawText);
              for (const pair of missing) {
                const pairChanges = allChanges.filter(c => c.versionPair === pair);
                saveChangesForPair(pair, pairChanges, aiCfg.provider, aiCfg.model);
              }
              resolve();
            } catch (e) {
              // Fallback: save raw as single entry
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
    const allPairs      = buildVersionPairs(srcVersion, destVersion);
    const breakingChanges = getCachedChanges(allPairs);

    // ── Step 3: Generate structured proposal ─────────────────────────────────
    onStatus('generating_proposal');
    const prompt = buildProposalPrompt(
      indexName, srcVersion, destVersion,
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
            proposal.savedAt   = new Date().toISOString();
            proposal.indexName = indexName;
            proposal.srcVersion  = srcVersion;
            proposal.destVersion = destVersion;
            onComplete(proposal);
            resolve();
          } catch (parseErr) {
            // Partial fallback: return what we can
            logger.warn('Proposal JSON parse failed, using fallback', { error: parseErr.message });
            onComplete({
              indexName,
              srcVersion,
              destVersion,
              savedAt:          new Date().toISOString(),
              impactReport:     rawText.slice(0, 3000),
              migrationStrategy: '',
              decision:         'MANUAL_ADJUSTMENTS',
              criticalIssues:   ['Could not parse AI response as JSON'],
              warnings:         [],
              migrationSteps:   [],
              proposedMapping:  mapping,
              proposedSettings: settings,
              proposedAnalyzers: {},
              proposedTemplate: null,
              proposedAliases:  [],
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
