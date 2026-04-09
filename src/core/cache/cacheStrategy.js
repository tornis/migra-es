import { set, get, del } from './redisClient.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('CacheStrategy');

/**
 * Cache key prefixes
 */
const CACHE_PREFIX = {
  DOCUMENT: 'doc:',
  MAPPING: 'mapping:',
  SETTINGS: 'settings:',
  PROGRESS: 'progress:',
  BATCH: 'batch:'
};

/**
 * Cache document
 * @param {string} indexName - Index name
 * @param {string} docId - Document ID
 * @param {object} document - Document data
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<void>}
 */
export async function cacheDocument(indexName, docId, document, ttl = 3600) {
  const key = `${CACHE_PREFIX.DOCUMENT}${indexName}:${docId}`;
  await set(key, document, ttl);
  logger.debug('Document cached', { index: indexName, docId });
}

/**
 * Get cached document
 * @param {string} indexName - Index name
 * @param {string} docId - Document ID
 * @returns {Promise<object|null>} Cached document or null
 */
export async function getCachedDocument(indexName, docId) {
  const key = `${CACHE_PREFIX.DOCUMENT}${indexName}:${docId}`;
  return await get(key);
}

/**
 * Cache mapping
 * @param {string} indexName - Index name
 * @param {object} mapping - Mapping data
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<void>}
 */
export async function cacheMapping(indexName, mapping, ttl = 7200) {
  const key = `${CACHE_PREFIX.MAPPING}${indexName}`;
  await set(key, mapping, ttl);
  logger.debug('Mapping cached', { index: indexName });
}

/**
 * Get cached mapping
 * @param {string} indexName - Index name
 * @returns {Promise<object|null>} Cached mapping or null
 */
export async function getCachedMapping(indexName) {
  const key = `${CACHE_PREFIX.MAPPING}${indexName}`;
  return await get(key);
}

/**
 * Cache settings
 * @param {string} indexName - Index name
 * @param {object} settings - Settings data
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<void>}
 */
export async function cacheSettings(indexName, settings, ttl = 7200) {
  const key = `${CACHE_PREFIX.SETTINGS}${indexName}`;
  await set(key, settings, ttl);
  logger.debug('Settings cached', { index: indexName });
}

/**
 * Get cached settings
 * @param {string} indexName - Index name
 * @returns {Promise<object|null>} Cached settings or null
 */
export async function getCachedSettings(indexName) {
  const key = `${CACHE_PREFIX.SETTINGS}${indexName}`;
  return await get(key);
}

/**
 * Cache migration progress
 * @param {string} taskId - Task ID
 * @param {object} progress - Progress data
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<void>}
 */
export async function cacheProgress(taskId, progress, ttl = 86400) {
  const key = `${CACHE_PREFIX.PROGRESS}${taskId}`;
  await set(key, progress, ttl);
  logger.debug('Progress cached', { taskId });
}

/**
 * Get cached progress
 * @param {string} taskId - Task ID
 * @returns {Promise<object|null>} Cached progress or null
 */
export async function getCachedProgress(taskId) {
  const key = `${CACHE_PREFIX.PROGRESS}${taskId}`;
  return await get(key);
}

/**
 * Delete progress cache
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function deleteProgressCache(taskId) {
  const key = `${CACHE_PREFIX.PROGRESS}${taskId}`;
  await del(key);
  logger.debug('Progress cache deleted', { taskId });
}

/**
 * Cache document batch
 * @param {string} batchId - Batch ID
 * @param {Array<object>} documents - Documents array
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<void>}
 */
export async function cacheBatch(batchId, documents, ttl = 1800) {
  const key = `${CACHE_PREFIX.BATCH}${batchId}`;
  await set(key, documents, ttl);
  logger.debug('Batch cached', { batchId, count: documents.length });
}

/**
 * Get cached batch
 * @param {string} batchId - Batch ID
 * @returns {Promise<Array<object>|null>} Cached batch or null
 */
export async function getCachedBatch(batchId) {
  const key = `${CACHE_PREFIX.BATCH}${batchId}`;
  return await get(key);
}

/**
 * Delete batch cache
 * @param {string} batchId - Batch ID
 * @returns {Promise<void>}
 */
export async function deleteBatchCache(batchId) {
  const key = `${CACHE_PREFIX.BATCH}${batchId}`;
  await del(key);
  logger.debug('Batch cache deleted', { batchId });
}

/**
 * Clear all cache for an index
 * @param {string} indexName - Index name
 * @returns {Promise<void>}
 */
export async function clearIndexCache(indexName) {
  await del(`${CACHE_PREFIX.MAPPING}${indexName}`);
  await del(`${CACHE_PREFIX.SETTINGS}${indexName}`);
  logger.info('Index cache cleared', { index: indexName });
}

export default {
  cacheDocument,
  getCachedDocument,
  cacheMapping,
  getCachedMapping,
  cacheSettings,
  getCachedSettings,
  cacheProgress,
  getCachedProgress,
  deleteProgressCache,
  cacheBatch,
  getCachedBatch,
  deleteBatchCache,
  clearIndexCache
};
