import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import config from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('BreakingChangesMemory');
const MEMORY_PATH = path.join(config.app.dir, 'breaking-changes.json');

/**
 * Load the full breaking changes memory from disk.
 * @returns {object} Map of "srcVer→destVer" → { generatedAt, provider, model, changes[] }
 */
export function loadMemory() {
  try {
    if (!existsSync(MEMORY_PATH)) return {};
    const raw = readFileSync(MEMORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Persist the full memory map to disk.
 * @param {object} memory
 */
function saveMemory(memory) {
  mkdirSync(config.app.dir, { recursive: true });
  writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf-8');
}

/**
 * Build the list of consecutive version pairs for a source→dest migration.
 * e.g. src=5, dest=9 → ["5→6", "6→7", "7→8", "8→9"]
 * @param {number} srcMajor
 * @param {number} destMajor
 * @returns {string[]}
 */
export function buildVersionPairs(srcMajor, destMajor) {
  const pairs = [];
  for (let v = srcMajor; v < destMajor; v++) {
    pairs.push(`${v}→${v + 1}`);
  }
  return pairs;
}

/**
 * Return which version pairs are already in memory vs. which are missing.
 * @param {number} srcMajor
 * @param {number} destMajor
 * @returns {{ cached: string[], missing: string[] }}
 */
export function checkMemory(srcMajor, destMajor) {
  const memory = loadMemory();
  const pairs = buildVersionPairs(srcMajor, destMajor);
  const cached  = pairs.filter(p => !!memory[p]);
  const missing = pairs.filter(p => !memory[p]);
  return { cached, missing };
}

/**
 * Retrieve cached breaking changes for a set of version pairs.
 * @param {string[]} pairs
 * @returns {Array} Flat list of breaking change objects
 */
export function getCachedChanges(pairs) {
  const memory = loadMemory();
  return pairs.flatMap(p => memory[p]?.changes ?? []);
}

/**
 * Save newly discovered breaking changes for a single version pair.
 * @param {string} pair   e.g. "5→6"
 * @param {Array}  changes
 * @param {string} provider
 * @param {string} model
 */
export function saveChangesForPair(pair, changes, provider, model) {
  const memory = loadMemory();
  memory[pair] = {
    generatedAt: new Date().toISOString(),
    provider,
    model,
    changes,
  };
  saveMemory(memory);
  logger.info('Breaking changes saved to memory', { pair, count: changes.length });
}

/**
 * Delete a specific version pair from memory (force regeneration).
 * @param {string} pair
 */
export function deletePair(pair) {
  const memory = loadMemory();
  delete memory[pair];
  saveMemory(memory);
  logger.info('Breaking changes pair deleted from memory', { pair });
}

/**
 * Get a summary of all pairs stored in memory.
 * @returns {Array<{ pair, generatedAt, provider, model, count }>}
 */
export function getMemorySummary() {
  const memory = loadMemory();
  return Object.entries(memory).map(([pair, data]) => ({
    pair,
    generatedAt: data.generatedAt,
    provider:    data.provider,
    model:       data.model,
    count:       data.changes?.length ?? 0,
  }));
}
