import { createLogger } from '../../utils/logger.js';

const logger = createLogger('BulkOperations');

/**
 * Perform bulk indexing operation
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Target index name
 * @param {Array<object>} documents - Documents to index
 * @param {number} retries - Number of retries on failure
 * @returns {Promise<object>} Bulk operation result
 */
export async function bulkIndex(client, indexName, documents, retries = 3) {
  if (!documents || documents.length === 0) {
    return { success: true, indexed: 0, failed: 0, errors: [] };
  }

  try {
    // Prepare bulk body
    const body = documents.flatMap(doc => [
      { index: { _index: indexName, _id: doc._id } },
      doc._source
    ]);

    logger.debug('Executing bulk index', { 
      index: indexName, 
      count: documents.length 
    });

    const response = await client.bulk({ 
      body,
      refresh: false,
      timeout: '5m'
    });

    // Process response
    const result = {
      success: !response.errors,
      indexed: 0,
      failed: 0,
      errors: []
    };

    if (response.items) {
      for (const item of response.items) {
        if (item.index) {
          if (item.index.error) {
            result.failed++;
            result.errors.push({
              id: item.index._id,
              error: item.index.error.reason || 'Unknown error'
            });
          } else {
            result.indexed++;
          }
        }
      }
    }

    if (result.failed > 0) {
      logger.warn('Bulk operation completed with errors', {
        indexed: result.indexed,
        failed: result.failed
      });
    } else {
      logger.debug('Bulk operation successful', {
        indexed: result.indexed
      });
    }

    return result;
  } catch (error) {
    logger.error('Bulk operation failed', { 
      error: error.message,
      retries 
    });

    // Retry logic
    if (retries > 0) {
      logger.info('Retrying bulk operation', { retriesLeft: retries - 1 });
      await sleep(1000); // Wait 1 second before retry
      return bulkIndex(client, indexName, documents, retries - 1);
    }

    throw error;
  }
}

/**
 * Scroll through all documents in an index
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Source index name
 * @param {object} options - Scroll options
 * @param {number} options.size - Batch size
 * @param {string} options.scroll - Scroll timeout
 * @param {object} options.query - Query filter
 * @param {Array<string>} options.sort - Sort fields
 * @returns {AsyncGenerator<Array<object>>} Document batches
 */
export async function* scrollDocuments(client, indexName, options = {}) {
  const {
    size = 5000,
    scroll = '5m',
    query = { match_all: {} },
    sort = ['_doc']
  } = options;

  try {
    logger.info('Starting scroll', { index: indexName, size });

    // Initial search
    let response = await client.search({
      index: indexName,
      scroll,
      size,
      body: {
        query,
        sort
      }
    });

    let scrollId = response._scroll_id;
    let hits = response.hits.hits;

    while (hits && hits.length > 0) {
      logger.debug('Scroll batch retrieved', { count: hits.length });
      yield hits;

      // Get next batch
      response = await client.scroll({
        scroll_id: scrollId,
        scroll
      });

      scrollId = response._scroll_id;
      hits = response.hits.hits;
    }

    // Clear scroll
    if (scrollId) {
      await client.clearScroll({ scroll_id: scrollId });
      logger.debug('Scroll cleared');
    }

    logger.info('Scroll completed', { index: indexName });
  } catch (error) {
    logger.error('Scroll failed', { 
      index: indexName, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Search documents with range query on control field
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Index name
 * @param {string} controlField - Control field name
 * @param {any} fromValue - Start value (exclusive)
 * @param {any} toValue - End value (inclusive)
 * @param {number} size - Batch size
 * @returns {Promise<Array<object>>} Documents
 */
export async function searchByRange(client, indexName, controlField, fromValue, toValue, size = 5000) {
  try {
    const query = {
      range: {
        [controlField]: {}
      }
    };

    if (fromValue !== null && fromValue !== undefined) {
      query.range[controlField].gt = fromValue;
    }

    if (toValue !== null && toValue !== undefined) {
      query.range[controlField].lte = toValue;
    }

    logger.debug('Searching by range', { 
      index: indexName, 
      field: controlField,
      from: fromValue,
      to: toValue
    });

    const response = await client.search({
      index: indexName,
      size,
      body: {
        query,
        sort: [{ [controlField]: 'asc' }]
      }
    });

    return response.hits.hits;
  } catch (error) {
    logger.error('Range search failed', { 
      index: indexName, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Get min and max values for a field
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Index name
 * @param {string} fieldName - Field name
 * @returns {Promise<object>} Min and max values
 */
export async function getFieldRange(client, indexName, fieldName) {
  try {
    logger.debug('Getting field range', { index: indexName, field: fieldName });

    const response = await client.search({
      index: indexName,
      size: 0,
      body: {
        aggs: {
          min_value: { min: { field: fieldName } },
          max_value: { max: { field: fieldName } }
        }
      }
    });

    const min = response.aggregations?.min_value?.value;
    const max = response.aggregations?.max_value?.value;

    logger.debug('Field range retrieved', { 
      index: indexName, 
      field: fieldName,
      min,
      max
    });

    return { min, max };
  } catch (error) {
    logger.error('Failed to get field range', { 
      index: indexName, 
      field: fieldName,
      error: error.message 
    });
    throw error;
  }
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  bulkIndex,
  scrollDocuments,
  searchByRange,
  getFieldRange
};
