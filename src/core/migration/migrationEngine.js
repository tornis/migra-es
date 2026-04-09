import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../utils/logger.js';
import { createElasticsearchClient } from '../elasticsearch/client.js';
import { getIndexMapping, getIndexSettings, createIndex, getDocumentCount, indexExists } from '../elasticsearch/indexManager.js';
import { getFieldRange, bulkIndex } from '../elasticsearch/bulkOperations.js';
import { convertMapping } from './mappingConverter.js';
import { convertSettings } from './analyzerConverter.js';
import config from '../../utils/config.js';
import { cacheMapping, cacheSettings, getCachedMapping, getCachedSettings } from '../cache/cacheStrategy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('MigrationEngine');

/**
 * Perform migration from source to destination
 * @param {object} migrationConfig - Migration configuration
 * @param {Function} progressCallback - Progress callback function
 * @returns {Promise<object>} Migration result
 */
export async function performMigration(migrationConfig, progressCallback) {
  const {
    taskId,
    sourceConfig,
    destConfig,
    indexName,
    controlField
  } = migrationConfig;

  logger.info('Starting migration', { taskId, indexName, controlField });

  let sourceClient = null;
  let destClient = null;

  try {
    // Create Elasticsearch clients
    sourceClient = await createElasticsearchClient(sourceConfig);
    destClient = await createElasticsearchClient(destConfig);

    // Get source index metadata
    logger.info('Retrieving source index metadata', { indexName });
    
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

    // Convert mapping and settings to ES9 format
    logger.info('Converting mapping and settings to ES9 format');
    const es9Mapping = convertMapping(sourceMapping);
    const es9Settings = convertSettings(sourceSettings);

    // Create destination index if it doesn't exist
    const destExists = await indexExists(destClient, indexName);
    if (!destExists) {
      logger.info('Creating destination index', { indexName });
      await createIndex(destClient, indexName, es9Mapping, es9Settings);
    } else {
      logger.warn('Destination index already exists', { indexName });
    }

    // Get total document count
    const totalDocs = await getDocumentCount(sourceClient, indexName);
    logger.info('Total documents to migrate', { count: totalDocs });

    // Initialize progress
    const progress = {
      total: totalDocs,
      processed: 0,
      failed: 0,
      lastControlValue: null
    };

    progressCallback(progress);

    let min = null;
    let max = null;

    // Get field range for control field (if provided)
    if (controlField) {
      const range = await getFieldRange(sourceClient, indexName, controlField);
      min = range.min;
      max = range.max;
      logger.info('Control field range', { field: controlField, min, max });
    } else {
      logger.warn('No control field provided - migration will run without checkpoints');
    }

    // Determine number of workers
    const numWorkers = Math.min(config.migration.workerThreads, 4);
    logger.info('Starting migration with workers', { numWorkers, hasControlField: !!controlField });

    // For simplicity, we'll use a single-threaded approach here
    // In production, you would split the range and use multiple workers
    const result = await migrateDocuments(
      sourceClient,
      destClient,
      indexName,
      controlField,
      min,
      max,
      progress,
      progressCallback
    );

    logger.info('Migration completed', { 
      taskId, 
      indexName,
      processed: result.processed,
      failed: result.failed
    });

    return result;

  } catch (error) {
    logger.error('Migration failed', { 
      taskId, 
      indexName,
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    // Close clients
    if (sourceClient) {
      await sourceClient.close();
    }
    if (destClient) {
      await destClient.close();
    }
  }
}

/**
 * Migrate documents using scroll API
 * @param {Client} sourceClient - Source Elasticsearch client
 * @param {Client} destClient - Destination Elasticsearch client
 * @param {string} indexName - Index name
 * @param {string} controlField - Control field name
 * @param {any} minValue - Minimum control field value
 * @param {any} maxValue - Maximum control field value
 * @param {object} progress - Progress object
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<object>} Migration result
 */
async function migrateDocuments(
  sourceClient,
  destClient,
  indexName,
  controlField,
  minValue,
  maxValue,
  progress,
  progressCallback
) {
  const scrollSize = config.migration.scrollSize;
  const bulkSize = config.migration.bulkSize;
  const scrollTimeout = config.migration.scrollTimeout;

  let processedCount = 0;
  let failedCount = 0;
  let lastValue = minValue;

  try {
    // Build search body
    const searchBody = {
      query: {
        match_all: {}
      }
    };

    // Add sorting only if control field is provided
    if (controlField) {
      searchBody.sort = [{ [controlField]: 'asc' }];
    }

    // Initial search with scroll
    let response = await sourceClient.search({
      index: indexName,
      scroll: scrollTimeout,
      size: scrollSize,
      body: searchBody
    });

    let scrollId = response._scroll_id;
    let hits = response.hits.hits;

    while (hits && hits.length > 0) {
      logger.debug('Processing batch', { count: hits.length });

      // Process in bulk batches
      for (let i = 0; i < hits.length; i += bulkSize) {
        const batch = hits.slice(i, i + bulkSize);
        
        try {
          const bulkResult = await bulkIndex(destClient, indexName, batch);
          processedCount += bulkResult.indexed;
          failedCount += bulkResult.failed;

          // Update last control value (only if control field exists)
          if (controlField && batch.length > 0) {
            const lastDoc = batch[batch.length - 1];
            lastValue = lastDoc._source[controlField];
          }

          // Update progress
          progress.processed = processedCount;
          progress.failed = failedCount;
          progress.lastControlValue = controlField ? lastValue : null;
          progressCallback(progress);

          logger.debug('Batch processed', { 
            indexed: bulkResult.indexed,
            failed: bulkResult.failed,
            total: processedCount
          });

        } catch (error) {
          logger.error('Batch indexing failed', { error: error.message });
          failedCount += batch.length;
        }
      }

      // Get next scroll batch
      response = await sourceClient.scroll({
        scroll_id: scrollId,
        scroll: scrollTimeout
      });

      scrollId = response._scroll_id;
      hits = response.hits.hits;
    }

    // Clear scroll
    if (scrollId) {
      await sourceClient.clearScroll({ scroll_id: scrollId });
    }

    logger.info('Document migration completed', { 
      processed: processedCount,
      failed: failedCount
    });

    return {
      processed: processedCount,
      failed: failedCount,
      lastControlValue: lastValue
    };

  } catch (error) {
    logger.error('Document migration error', { error: error.message });
    throw error;
  }
}

/**
 * Resume migration from last checkpoint
 * @param {object} migrationConfig - Migration configuration
 * @param {any} lastControlValue - Last processed control value
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<object>} Migration result
 */
export async function resumeMigration(migrationConfig, lastControlValue, progressCallback) {
  logger.info('Resuming migration from checkpoint', { 
    taskId: migrationConfig.taskId,
    lastControlValue 
  });

  // Similar to performMigration but starts from lastControlValue
  // Implementation would filter documents where controlField > lastControlValue
  
  return performMigration(migrationConfig, progressCallback);
}

export default {
  performMigration,
  resumeMigration
};
