import { createLogger } from '../../utils/logger.js';

const logger = createLogger('BulkOperations');

// ES default http.max_content_length is 100 MB. We stay 10 MB under to leave
// room for HTTP headers and NDJSON framing overhead. Override via MAX_BULK_BYTES.
const MAX_BULK_BYTES = parseInt(process.env.MAX_BULK_BYTES || String(90 * 1024 * 1024), 10);

/**
 * Perform bulk indexing operation.
 *
 * Automatically splits batches whose NDJSON payload would exceed MAX_BULK_BYTES
 * (default 90 MB) to avoid 413 errors when the index contains large documents.
 * Documents that exceed the limit even individually are counted as failures.
 *
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

  // Estimate the NDJSON payload size incrementally.
  // Short-circuit as soon as we know the batch exceeds the limit so we avoid
  // serialising every document in a large healthy batch.
  let estimatedBytes = 0;
  let exceedsLimit = false;
  for (const doc of documents) {
    const source = { ...doc._source };
    if (doc._type && doc._type !== '_doc') source.source_type = doc._type;
    estimatedBytes +=
      Buffer.byteLength(JSON.stringify({ index: { _index: indexName, _id: doc._id } })) +
      Buffer.byteLength(JSON.stringify(source)) +
      2; // two newlines in NDJSON
    if (estimatedBytes > MAX_BULK_BYTES) {
      exceedsLimit = true;
      break;
    }
  }

  if (exceedsLimit) {
    if (documents.length === 1) {
      // A single document already exceeds the limit — it cannot be indexed.
      const doc = documents[0];
      logger.warn('Document exceeds MAX_BULK_BYTES and cannot be migrated', {
        index: indexName,
        id: doc._id,
        maxBytes: MAX_BULK_BYTES,
        hint: 'Raise MAX_BULK_BYTES env var or increase http.max_content_length on the destination cluster',
      });
      return {
        success: false,
        indexed: 0,
        failed: 1,
        errors: [{ id: doc._id, error: `Document exceeds bulk size limit of ${MAX_BULK_BYTES} bytes` }],
      };
    }

    // Split in half and process each half independently so large documents
    // are eventually isolated down to single-document requests.
    logger.warn('Bulk payload exceeds size limit — splitting batch', {
      index: indexName,
      count: documents.length,
      maxBytes: MAX_BULK_BYTES,
    });
    const mid = Math.ceil(documents.length / 2);
    const left  = await bulkIndex(client, indexName, documents.slice(0, mid), retries);
    const right = await bulkIndex(client, indexName, documents.slice(mid),     retries);
    return {
      success: left.success && right.success,
      indexed: left.indexed  + right.indexed,
      failed:  left.failed   + right.failed,
      errors:  [...left.errors, ...right.errors],
    };
  }

  try {
    // Prepare bulk body.
    // ES 2/5/6 documents carry a _type metadata field (e.g. "line", "event").
    // ES 8/9 removed types entirely, so we preserve the value as a regular
    // keyword field "source_type" in _source — but only when the type is
    // meaningful (skip the default "_doc" introduced in ES 7+).
    const body = documents.flatMap(doc => {
      const source = { ...doc._source };
      if (doc._type && doc._type !== '_doc') {
        source.source_type = doc._type;
      }
      return [
        { index: { _index: indexName, _id: doc._id } },
        source,
      ];
    });

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
      await sleep(1000);
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

    const hitsContainer = response.hits;
    if (!hitsContainer) {
      throw new Error(`Malformed initial scroll response from index "${indexName}": missing hits object`);
    }

    const total = hitsContainer.total?.value ?? hitsContainer.total ?? 0;
    logger.info('Scroll initialised', { index: indexName, total });

    _warnShardFailures(response, indexName, logger);

    let hits = hitsContainer.hits ?? [];

    while (hits.length > 0) {
      logger.debug('Scroll batch retrieved', { count: hits.length });
      yield hits;

      // Get next batch
      response = await client.scroll({
        scroll_id: scrollId,
        scroll
      });

      if (response.timed_out) {
        logger.warn('Scroll batch timed out — results may be incomplete', { index: indexName });
      }

      _warnShardFailures(response, indexName, logger);

      if (!response.hits) {
        throw new Error(`Malformed scroll response from index "${indexName}": missing hits object`);
      }

      scrollId = response._scroll_id;
      hits = response.hits.hits ?? [];
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
 * Warn when a scroll response reports shard failures.
 * Shard failures silently reduce the number of returned documents,
 * making the migration appear successful with fewer docs than expected.
 */
function _warnShardFailures(response, indexName, log) {
  const shards = response._shards;
  if (shards && shards.failed > 0) {
    log.warn('Scroll response has shard failures — document count will be lower than expected', {
      index: indexName,
      shards_total: shards.total,
      shards_successful: shards.successful,
      shards_failed: shards.failed,
    });
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
