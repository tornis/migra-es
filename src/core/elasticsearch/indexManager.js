import { createLogger } from '../../utils/logger.js';

const logger = createLogger('IndexManager');

/**
 * List all indices from Elasticsearch
 * @param {Client} client - Elasticsearch client
 * @returns {Promise<Array>} List of indices with metadata
 */
export async function listIndices(client) {
  try {
    logger.info('Listing indices');
    const response = await client.cat.indices({
      format: 'json',
      h: 'index,docs.count,store.size,pri,rep,status,health'
    });

    // Filter out system indices (starting with .)
    const indices = response
      .filter(index => !index.index.startsWith('.'))
      .map(index => ({
        name: index.index,
        docsCount: parseInt(index['docs.count'] || '0', 10),
        storeSize: index['store.size'] || '0b',
        primaryShards: parseInt(index.pri || '1', 10),
        replicas: parseInt(index.rep || '1', 10),
        status: index.status,
        health: index.health
      }));

    logger.info(`Found ${indices.length} indices`);
    return indices;
  } catch (error) {
    logger.error('Failed to list indices', { error: error.message });
    throw error;
  }
}

/**
 * Get index mapping
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Index name
 * @returns {Promise<object>} Index mapping
 */
export async function getIndexMapping(client, indexName) {
  try {
    logger.info('Getting index mapping', { index: indexName });
    const response = await client.indices.getMapping({ index: indexName });
    
    // Log full response for debugging
    logger.debug('Full mapping response', { 
      index: indexName,
      response: JSON.stringify(response).substring(0, 1000)
    });
    
    const mapping = response[indexName]?.mappings || {};
    
    logger.debug('Extracted mapping', { 
      index: indexName,
      mapping: JSON.stringify(mapping).substring(0, 500),
      hasProperties: !!mapping.properties,
      keys: Object.keys(mapping)
    });
    
    return mapping;
  } catch (error) {
    logger.error('Failed to get index mapping', { 
      index: indexName, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Get index settings
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Index name
 * @returns {Promise<object>} Index settings
 */
export async function getIndexSettings(client, indexName) {
  try {
    logger.info('Getting index settings', { index: indexName });
    const response = await client.indices.getSettings({ index: indexName });
    const settings = response[indexName]?.settings || {};
    logger.debug('Settings retrieved', { index: indexName });
    return settings;
  } catch (error) {
    logger.error('Failed to get index settings', { 
      index: indexName, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Check if index exists
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Index name
 * @returns {Promise<boolean>} True if index exists
 */
export async function indexExists(client, indexName) {
  try {
    const exists = await client.indices.exists({ index: indexName });
    logger.debug('Index existence check', { index: indexName, exists });
    return exists;
  } catch (error) {
    logger.error('Failed to check index existence', { 
      index: indexName, 
      error: error.message 
    });
    return false;
  }
}

/**
 * Create index with mapping and settings
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Index name
 * @param {object} mapping - Index mapping
 * @param {object} settings - Index settings
 * @returns {Promise<object>} Creation response
 */
export async function createIndex(client, indexName, mapping, settings) {
  try {
    logger.info('Creating index', { index: indexName });
    
    const body = {};
    
    if (settings) {
      body.settings = settings;
    }
    
    if (mapping) {
      body.mappings = mapping;
    }

    const response = await client.indices.create({
      index: indexName,
      body
    });

    logger.info('Index created successfully', { index: indexName });
    return response;
  } catch (error) {
    logger.error('Failed to create index', { 
      index: indexName, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Delete index
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Index name
 * @returns {Promise<object>} Deletion response
 */
export async function deleteIndex(client, indexName) {
  try {
    logger.warn('Deleting index', { index: indexName });
    const response = await client.indices.delete({ index: indexName });
    logger.info('Index deleted', { index: indexName });
    return response;
  } catch (error) {
    logger.error('Failed to delete index', { 
      index: indexName, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Get count of documents in index
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Index name
 * @returns {Promise<number>} Document count
 */
export async function getDocumentCount(client, indexName) {
  try {
    const response = await client.count({ index: indexName });
    const count = response.count || 0;
    logger.debug('Document count retrieved', { index: indexName, count });
    return count;
  } catch (error) {
    logger.error('Failed to get document count', { 
      index: indexName, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Get fields from index mapping
 * @param {object} mapping - Index mapping
 * @param {string} prefix - Field prefix for nested fields
 * @returns {Array<object>} List of fields with metadata
 */
export function extractFieldsFromMapping(mapping, prefix = '') {
  const fields = [];
  
  if (!mapping || !mapping.properties) {
    return fields;
  }

  for (const [fieldName, fieldConfig] of Object.entries(mapping.properties)) {
    const fullPath = prefix ? `${prefix}.${fieldName}` : fieldName;
    
    fields.push({
      name: fullPath,
      type: fieldConfig.type || 'object',
      format: fieldConfig.format,
      analyzer: fieldConfig.analyzer,
      fields: fieldConfig.fields
    });

    // Recursively extract nested fields
    if (fieldConfig.properties) {
      const nestedFields = extractFieldsFromMapping(fieldConfig, fullPath);
      fields.push(...nestedFields);
    }
  }

  return fields;
}

/**
 * Refresh index
 * @param {Client} client - Elasticsearch client
 * @param {string} indexName - Index name
 * @returns {Promise<object>} Refresh response
 */
export async function refreshIndex(client, indexName) {
  try {
    logger.debug('Refreshing index', { index: indexName });
    const response = await client.indices.refresh({ index: indexName });
    return response;
  } catch (error) {
    logger.error('Failed to refresh index', { 
      index: indexName, 
      error: error.message 
    });
    throw error;
  }
}

export default {
  listIndices,
  getIndexMapping,
  getIndexSettings,
  indexExists,
  createIndex,
  deleteIndex,
  getDocumentCount,
  extractFieldsFromMapping,
  refreshIndex
};
