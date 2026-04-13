import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import config from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('IndexArtifacts');

function indexDir(indexName) {
  return path.join(config.app.dir, 'indices', indexName);
}

function artifactPath(indexName, filename) {
  return path.join(indexDir(indexName), filename);
}

/**
 * Check if a saved proposal exists for an index.
 */
export function proposalExists(indexName) {
  return existsSync(artifactPath(indexName, 'proposal.json'));
}

/**
 * Load a saved proposal for an index.
 * @returns {object|null}
 */
export function loadProposal(indexName) {
  const file = artifactPath(indexName, 'proposal.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Save all artifacts for an index from a proposal object.
 * Creates ~/.migra-es/indices/{indexName}/ and writes all files.
 *
 * @param {string} indexName
 * @param {object} proposal
 */
export function saveProposal(indexName, proposal) {
  const dir = indexDir(indexName);
  mkdirSync(dir, { recursive: true });

  // Full proposal JSON (source of truth)
  writeFileSync(
    artifactPath(indexName, 'proposal.json'),
    JSON.stringify(proposal, null, 2),
    'utf-8',
  );

  // Human-readable report
  if (proposal.impactReport) {
    writeFileSync(
      artifactPath(indexName, 'impact-report.md'),
      `# Impact Analysis: ${indexName}\n\n${proposal.impactReport}`,
      'utf-8',
    );
  }

  // Migration strategy
  if (proposal.migrationStrategy) {
    writeFileSync(
      artifactPath(indexName, 'migration-strategy.md'),
      `# Migration Strategy: ${indexName}\n\n${proposal.migrationStrategy}`,
      'utf-8',
    );
  }

  // Structured artifacts — only write non-empty objects
  if (proposal.proposedMapping && Object.keys(proposal.proposedMapping).length > 0) {
    writeFileSync(
      artifactPath(indexName, 'mapping.json'),
      JSON.stringify(proposal.proposedMapping, null, 2),
      'utf-8',
    );
  }

  if (proposal.proposedSettings && Object.keys(proposal.proposedSettings).length > 0) {
    writeFileSync(
      artifactPath(indexName, 'settings.json'),
      JSON.stringify(proposal.proposedSettings, null, 2),
      'utf-8',
    );
  }

  if (proposal.proposedAnalyzers && Object.keys(proposal.proposedAnalyzers).length > 0) {
    writeFileSync(
      artifactPath(indexName, 'analyzers.json'),
      JSON.stringify(proposal.proposedAnalyzers, null, 2),
      'utf-8',
    );
  }

  if (proposal.proposedTemplate && Object.keys(proposal.proposedTemplate).length > 0) {
    writeFileSync(
      artifactPath(indexName, 'template.json'),
      JSON.stringify(proposal.proposedTemplate, null, 2),
      'utf-8',
    );
  }

  if (proposal.proposedAliases && proposal.proposedAliases.length > 0) {
    writeFileSync(
      artifactPath(indexName, 'aliases.json'),
      JSON.stringify(proposal.proposedAliases, null, 2),
      'utf-8',
    );
  }

  logger.info('Index artifacts saved', { indexName, dir });
}

/**
 * List all indices that have saved proposals.
 * @returns {Array<{ indexName, savedAt, decision }>}
 */
export function listSavedProposals() {
  const base = path.join(config.app.dir, 'indices');
  if (!existsSync(base)) return [];
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const proposal = loadProposal(d.name);
        return {
          indexName: d.name,
          savedAt:   proposal?.savedAt ?? null,
          decision:  proposal?.decision ?? null,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Get the directory path for an index's artifacts (for display).
 */
export function getIndexArtifactsDir(indexName) {
  return indexDir(indexName);
}
