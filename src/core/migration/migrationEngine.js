import { createLogger } from '../../utils/logger.js';
import { createElasticsearchClient } from '../elasticsearch/client.js';
import {
  getIndexMapping, getIndexSettings,
  createIndex, getDocumentCount, indexExists,
} from '../elasticsearch/indexManager.js';
import { scrollDocuments, bulkIndex } from '../elasticsearch/bulkOperations.js';
import { convertMapping } from './mappingConverter.js';
import { convertSettings } from './analyzerConverter.js';
import {
  cacheMapping, cacheSettings,
  getCachedMapping, getCachedSettings,
} from '../cache/cacheStrategy.js';
import { updateTaskProgress } from '../../database/db.js';
import { getRedisClient } from '../cache/redisClient.js';
import { getWriterQueue } from '../tasks/taskManager.js';
import config from '../../utils/config.js';

const logger = createLogger('MigrationEngine');

// ─── Reader ──────────────────────────────────────────────────────────────────

/**
 * Reader: scrolls the source index and enqueues document batches to the
 * writer queue via Redis-backed keys so Bull jobs stay small.
 *
 * Supports checkpoint-based resume: if `lastControlValue` is provided, the
 * scroll query filters `controlField > lastControlValue`.
 *
 * @param {object} jobData
 * @param {string} jobData.taskId
 * @param {object} jobData.sourceConfig
 * @param {object} jobData.destConfig
 * @param {string} jobData.indexName
 * @param {string|null} jobData.controlField
 * @param {any} jobData.lastControlValue  - Resume checkpoint (null = start fresh)
 * @param {Function} [onProgress]
 */
export async function runReader(jobData, onProgress) {
  const { taskId, sourceConfig, destConfig, indexName, controlField, lastControlValue } = jobData;

  logger.info('Reader starting', { taskId, indexName, controlField, resume: lastControlValue != null });

  const redis = getRedisClient();
  let sourceClient = null;
  let destClient = null;

  try {
    sourceClient = await createElasticsearchClient(sourceConfig);
    destClient   = await createElasticsearchClient(destConfig);

    // ── Prepare destination index ──────────────────────────────────────────

    let sourceMapping = await getCachedMapping(indexName);
    if (!sourceMapping) {
      sourceMapping = await getIndexMapping(sourceClient, indexName);
      await cacheMapping(indexName, sourceMapping);
    }

    let sourceSettings = await getCachedSettings(indexName);
    if (!sourceSettings) {
      sourceSettings = await getIndexSettings(sourceClient, indexName);
      await cacheSettings(indexName, sourceSettings);
    }

    const es9Mapping  = convertMapping(sourceMapping);
    const es9Settings = convertSettings(sourceSettings);

    if (!await indexExists(destClient, indexName)) {
      logger.info('Creating destination index', { indexName });
      await createIndex(destClient, indexName, es9Mapping, es9Settings);
    } else {
      logger.warn('Destination index already exists, appending', { indexName });
    }

    // ── Count total docs ───────────────────────────────────────────────────

    const total = await getDocumentCount(sourceClient, indexName);
    logger.info('Total documents in source', { indexName, total });

    await updateTaskProgress(taskId, {
      total,
      enqueued: 0,
      lastControlValue,
      readerDone: false,
    });

    onProgress && onProgress({ total, enqueued: 0 });

    // ── Build scroll query ─────────────────────────────────────────────────

    const query = (controlField && lastControlValue != null)
      ? { range: { [controlField]: { gt: lastControlValue } } }
      : { match_all: {} };

    const sort = controlField ? [{ [controlField]: 'asc' }] : ['_doc'];

    // ── Scroll + enqueue ───────────────────────────────────────────────────

    const writerQueue  = getWriterQueue();
    const scrollSize   = config.migration.scrollSize;
    const bulkSize     = config.migration.bulkSize;

    let enqueued            = 0;
    let batchNum            = 0;
    let currentControlValue = lastControlValue;

    for await (const scrollBatch of scrollDocuments(sourceClient, indexName, {
      size: scrollSize,
      scroll: config.migration.scrollTimeout,
      query,
      sort,
    })) {
      // Check control flags before each batch
      const [paused, cancelled] = await Promise.all([
        redis.get(`migration:${taskId}:paused`),
        redis.get(`migration:${taskId}:cancelled`),
      ]);

      if (cancelled) {
        logger.info('Reader stopped: task cancelled', { taskId });
        return { enqueued, cancelled: true };
      }

      if (paused) {
        logger.info('Reader stopped: task paused', { taskId, checkpoint: currentControlValue });
        return { enqueued, paused: true };
      }

      // Split scroll batch into writer-sized chunks
      for (let i = 0; i < scrollBatch.length; i += bulkSize) {
        const chunk = scrollBatch.slice(i, i + bulkSize);
        if (chunk.length === 0) continue;

        // Store docs in Redis (decoupled from Bull job payload)
        const batchKey = `migration:${taskId}:batch:${batchNum}`;
        await redis.set(batchKey, JSON.stringify(chunk), 'EX', 7200); // 2 hour TTL

        // Increment pending counter BEFORE enqueuing so check-completion is correct
        await redis.incr(`migration:${taskId}:pending`);

        await writerQueue.add(
          {
            taskId,
            destConfig,
            indexName,
            batchKey,
            batchNum,
            count: chunk.length,
          },
          {
            attempts: config.migration.maxRetries,
            backoff: { type: 'exponential', delay: config.migration.retryDelay },
          }
        );

        batchNum++;
        enqueued += chunk.length;

        // Advance checkpoint to last doc in chunk (if control field present)
        if (controlField && chunk.length > 0) {
          currentControlValue = chunk[chunk.length - 1]._source?.[controlField] ?? currentControlValue;
        }
      }

      // Persist progress after each scroll batch
      await updateTaskProgress(taskId, {
        total,
        enqueued,
        lastControlValue: currentControlValue,
        readerDone: false,
      });

      onProgress && onProgress({ total, enqueued });
      logger.debug('Scroll batch enqueued', { taskId, batchNum, enqueued });
    }

    // ── Mark reader done ───────────────────────────────────────────────────

    // Re-check flags (could have been set during last batch)
    const [paused, cancelled] = await Promise.all([
      redis.get(`migration:${taskId}:paused`),
      redis.get(`migration:${taskId}:cancelled`),
    ]);

    if (!paused && !cancelled) {
      await updateTaskProgress(taskId, {
        total,
        enqueued,
        lastControlValue: currentControlValue,
        readerDone: true,
      });

      logger.info('Reader done — all batches enqueued', { taskId, enqueued });

      // If no batches were enqueued at all (empty index), complete immediately
      const pending = parseInt(await redis.get(`migration:${taskId}:pending`) || '0', 10);
      if (pending <= 0) {
        const { updateTaskStatus } = await import('../../database/db.js');
        await updateTaskStatus(taskId, 'completed');
        logger.info('Task completed immediately (empty source index)', { taskId });
      }
    }

    return { enqueued };

  } finally {
    if (sourceClient) await sourceClient.close().catch(() => {});
    if (destClient)   await destClient.close().catch(() => {});
  }
}

// ─── Writer ──────────────────────────────────────────────────────────────────

/**
 * Writer: retrieves a document batch from Redis and bulk-indexes it to the
 * destination ES cluster. Updates atomic Redis counters for progress tracking.
 *
 * @param {object} jobData
 * @param {string} jobData.taskId
 * @param {object} jobData.destConfig
 * @param {string} jobData.indexName
 * @param {string} jobData.batchKey  - Redis key holding the serialised docs
 * @param {number} jobData.batchNum
 */
export async function runWriter(jobData) {
  const { taskId, destConfig, indexName, batchKey, batchNum } = jobData;

  const redis = getRedisClient();

  // Skip if task was cancelled
  const cancelled = await redis.get(`migration:${taskId}:cancelled`);
  if (cancelled) {
    logger.info('Writer batch skipped (cancelled)', { taskId, batchNum });
    await redis.del(batchKey);
    return { indexed: 0, failed: 0 };
  }

  // Load docs from Redis
  const raw = await redis.get(batchKey);
  if (!raw) {
    logger.warn('Batch key not found in Redis (already processed or expired)', { taskId, batchKey });
    return { indexed: 0, failed: 0 };
  }

  const docs = JSON.parse(raw);
  let destClient = null;

  try {
    destClient = await createElasticsearchClient(destConfig);
    const result = await bulkIndex(destClient, indexName, docs);

    // Atomic progress counters
    if (result.indexed > 0) await redis.incrby(`migration:${taskId}:written`, result.indexed);
    if (result.failed  > 0) await redis.incrby(`migration:${taskId}:failed`,  result.failed);

    logger.debug('Writer batch complete', {
      taskId, batchNum,
      indexed: result.indexed,
      failed: result.failed,
    });

    return result;
  } finally {
    if (destClient) await destClient.close().catch(() => {});
    // Delete the batch key regardless of success/failure
    await redis.del(batchKey).catch(() => {});
  }
}
