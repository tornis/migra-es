import { createLogger } from '../../utils/logger.js';
import { createElasticsearchClient } from '../elasticsearch/client.js';
import {
  getIndexMapping, getIndexSettings,
  createIndex, getDocumentCount, indexExists,
} from '../elasticsearch/indexManager.js';
import { scrollDocuments, bulkIndex } from '../elasticsearch/bulkOperations.js';
import { convertMapping, hasVectorFields } from './mappingConverter.js';
import { convertSettings } from './analyzerConverter.js';
import {
  cacheMapping, cacheSettings,
  getCachedMapping, getCachedSettings,
} from '../cache/cacheStrategy.js';
import { loadProposal } from '../ai/indexArtifacts.js';
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

    // ── Resolve engine types ───────────────────────────────────────────────

    const srcEngine  = sourceConfig.engine  ?? 'elasticsearch';
    const destEngine = destConfig.engine    ?? 'elasticsearch';

    logger.info('Engine types resolved', { srcEngine, destEngine });

    // ── Choose mapping/settings source: AI proposal vs auto-converter ────────

    const aiProposal = loadProposal(indexName);
    let finalMapping, finalSettings;

    if (aiProposal?.proposedMapping && Object.keys(aiProposal.proposedMapping).length > 0) {
      logger.info('Using AI-generated mapping for destination index', { indexName });
      finalMapping  = aiProposal.proposedMapping;
      finalSettings = aiProposal.proposedSettings ?? {};

      // Merge custom analyzers into settings.index.analysis if provided separately
      if (aiProposal.proposedAnalyzers && Object.keys(aiProposal.proposedAnalyzers).length > 0) {
        finalSettings = {
          ...finalSettings,
          index: {
            ...(finalSettings.index ?? {}),
            analysis: {
              ...(finalSettings.index?.analysis ?? {}),
              ...aiProposal.proposedAnalyzers,
            },
          },
        };
      }
    } else {
      logger.info('No AI proposal found, using auto-converter', { indexName });
      finalMapping  = convertMapping(sourceMapping, srcEngine, destEngine);
      finalSettings = convertSettings(sourceSettings);
    }

    // ── OpenSearch knn settings injection ─────────────────────────────────────
    // When destination is OpenSearch and the mapping contains knn_vector fields,
    // the index MUST have "index.knn: true" in settings for the knn plugin.
    if (destEngine === 'opensearch' && hasVectorFields(finalMapping)) {
      logger.info('Adding index.knn: true for OpenSearch knn_vector fields', { indexName });
      finalSettings = {
        ...finalSettings,
        index: {
          ...(finalSettings.index ?? {}),
          knn: true,
        },
      };
    }

    // Strip settings that are exclusive to the other engine
    finalSettings = sanitizeSettingsForEngine(finalSettings, destEngine);

    if (!await indexExists(destClient, indexName)) {
      logger.info('Creating destination index', { indexName });
      await createIndex(destClient, indexName, finalMapping, finalSettings);

      // Apply index template if proposed
      if (aiProposal?.proposedTemplate && Object.keys(aiProposal.proposedTemplate).length > 0) {
        try {
          await destClient.indices.putTemplate({
            name: `${indexName}-template`,
            body: aiProposal.proposedTemplate,
          });
          logger.info('Index template applied', { indexName });
        } catch (tplErr) {
          logger.warn('Failed to apply index template', { indexName, error: tplErr.message });
        }
      }

      // Create aliases if proposed
      if (aiProposal?.proposedAliases?.length > 0) {
        try {
          const actions = aiProposal.proposedAliases.map(alias => ({
            add: { index: indexName, alias },
          }));
          await destClient.indices.updateAliases({ body: { actions } });
          logger.info('Aliases created', { indexName, aliases: aiProposal.proposedAliases });
        } catch (aliasErr) {
          logger.warn('Failed to create aliases', { indexName, error: aliasErr.message });
        }
      }
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

// ─── Settings sanitizer ───────────────────────────────────────────────────────

/**
 * Remove settings that are incompatible with the target engine.
 * Prevents index creation failures when crossing ES ↔ OpenSearch.
 *
 * @param {object} settings
 * @param {'elasticsearch'|'opensearch'} destEngine
 * @returns {object}
 */
function sanitizeSettingsForEngine(settings, destEngine) {
  if (!settings) return {};

  // Fields that must always be stripped (read-only / immutable)
  const alwaysStrip = [
    'index.creation_date', 'index.uuid', 'index.version',
    'index.provided_name', 'index.routing.allocation.initial_recovery',
  ];

  // ES-only settings to strip when targeting OpenSearch
  const esOnly = ['xpack.', 'indices.breaker.'];

  // OpenSearch-only settings to strip when targeting Elasticsearch
  const osOnly = ['index.knn.space_type', 'plugins.'];

  const stripPrefixes = destEngine === 'opensearch' ? esOnly : osOnly;

  function clean(obj, path = '') {
    if (!obj || typeof obj !== 'object') return obj;
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = path ? `${path}.${k}` : k;
      if (alwaysStrip.some(s => fullKey === s || fullKey.startsWith(s))) continue;
      if (stripPrefixes.some(p => fullKey.startsWith(p))) continue;
      result[k] = typeof v === 'object' && !Array.isArray(v) ? clean(v, fullKey) : v;
    }
    return result;
  }

  return clean(settings);
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
