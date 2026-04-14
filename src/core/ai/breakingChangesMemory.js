import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import config from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';
import { engineTag } from '../elasticsearch/engineDetector.js';

const logger = createLogger('BreakingChangesMemory');
const MEMORY_PATH = path.join(config.app.dir, 'breaking-changes.json');

// ── Storage ───────────────────────────────────────────────────────────────────

/**
 * Migrate legacy cache keys from old format ("5→6") to namespaced ("ES:5→6").
 * Called automatically on every load so old caches remain usable.
 */
function migrateOldKeys(memory) {
  let changed = false;
  for (const key of Object.keys(memory)) {
    if (/^\d+→\d+$/.test(key)) {
      const newKey = `ES:${key}`;
      if (!memory[newKey]) {
        memory[newKey] = memory[key];
        changed = true;
      }
      delete memory[key];
      changed = true;
    }
  }
  return { memory, changed };
}

/**
 * Load the full breaking changes memory from disk.
 * @returns {object} Map of pair key → { generatedAt, provider, model, changes[] }
 */
export function loadMemory() {
  try {
    if (!existsSync(MEMORY_PATH)) return {};
    const raw    = readFileSync(MEMORY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const { memory, changed } = migrateOldKeys(parsed);
    if (changed) saveMemory(memory);
    return memory;
  } catch {
    return {};
  }
}

/**
 * Persist the full memory map to disk.
 */
function saveMemory(memory) {
  mkdirSync(config.app.dir, { recursive: true });
  writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf-8');
}

// ── Pair key builders ─────────────────────────────────────────────────────────

/**
 * Build the list of cache-key pairs for a given src→dest migration.
 *
 * Same-engine:
 *   ES 5 → ES 9  →  ["ES:5→6", "ES:6→7", "ES:7→8", "ES:8→9"]
 *   OS 1 → OS 2  →  ["OS:1→2"]
 *
 * Cross-engine:
 *   ES 8 → OS 2  →  ["ES→OS", "OS:1→2"]   (platform transition + target chain)
 *   OS 2 → ES 8  →  ["OS→ES", "ES:7→8"]   (platform transition + target chain)
 *
 * @param {string} srcEngine  - 'elasticsearch' | 'opensearch'
 * @param {number} srcMajor
 * @param {string} destEngine - 'elasticsearch' | 'opensearch'
 * @param {number} destMajor
 * @returns {string[]}
 */
export function buildVersionPairs(srcEngine, srcMajor, destEngine, destMajor) {
  const srcTag  = engineTag(srcEngine);
  const destTag = engineTag(destEngine);

  if (srcTag !== destTag) {
    // Cross-solution: one cross-platform pair + dest-engine internal chain
    const pairs = [`${srcTag}→${destTag}`];
    for (let v = 1; v < destMajor; v++) {
      pairs.push(`${destTag}:${v}→${v + 1}`);
    }
    return pairs;
  }

  // Same-solution version chain
  const pairs = [];
  for (let v = srcMajor; v < destMajor; v++) {
    pairs.push(`${srcTag}:${v}→${v + 1}`);
  }
  return pairs;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return which version pairs are already in memory vs. which are missing.
 *
 * @param {string} srcEngine
 * @param {number} srcMajor
 * @param {string} destEngine
 * @param {number} destMajor
 * @returns {{ cached: string[], missing: string[] }}
 */
export function checkMemory(srcEngine, srcMajor, destEngine, destMajor) {
  const memory  = loadMemory();
  const pairs   = buildVersionPairs(srcEngine, srcMajor, destEngine, destMajor);
  const cached  = pairs.filter(p => !!memory[p]);
  const missing = pairs.filter(p => !memory[p]);
  return { cached, missing };
}

/**
 * Retrieve cached breaking changes for a set of pair keys.
 * @param {string[]} pairs
 * @returns {Array} Flat list of breaking change objects
 */
export function getCachedChanges(pairs) {
  const memory = loadMemory();
  return pairs.flatMap(p => memory[p]?.changes ?? []);
}

/**
 * Save newly discovered breaking changes for a single pair key.
 * @param {string} pair     e.g. "ES:5→6" | "ES→OS"
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
  logger.info('Breaking changes saved', { pair, count: changes.length });
}

/**
 * Delete a specific pair from memory (force regeneration on next run).
 * @param {string} pair
 */
export function deletePair(pair) {
  const memory = loadMemory();
  delete memory[pair];
  saveMemory(memory);
  logger.info('Breaking changes pair deleted', { pair });
}

/**
 * Get a display summary of all pairs stored in memory.
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
