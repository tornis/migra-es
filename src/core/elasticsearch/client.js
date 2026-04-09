import { Client } from '@elastic/elasticsearch';
import { createLegacyElasticsearchClient } from './legacyClient.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ElasticsearchClient');

/**
 * Detect Elasticsearch version
 * @param {object} config - Elasticsearch configuration
 * @returns {Promise<number>} Major version number
 */
async function detectElasticsearchVersion(config) {
  try {
    // Try with legacy client first (works with all versions)
    const legacyClient = createLegacyElasticsearchClient(config);
    const info = await legacyClient.info();
    await legacyClient.close();
    
    const version = info.version?.number || '0.0.0';
    const majorVersion = parseInt(version.split('.')[0], 10);
    
    logger.info('Detected Elasticsearch version', { version, majorVersion });
    return majorVersion;
  } catch (error) {
    logger.warn('Failed to detect ES version, defaulting to legacy client', { error: error.message });
    return 5; // Default to legacy for safety
  }
}

/**
 * Create Elasticsearch client with configuration
 * Auto-detects version and uses appropriate client
 * @param {object} config - Elasticsearch configuration
 * @param {string} config.url - Elasticsearch URL
 * @param {string} config.user - Username (optional)
 * @param {string} config.password - Password (optional)
 * @param {boolean} config.ssl - Use SSL
 * @param {boolean} config.rejectUnauthorized - Reject unauthorized certificates
 * @returns {Promise<Client|LegacyElasticsearchClient>} Elasticsearch client instance
 */
export async function createElasticsearchClient(config) {
  // Detect version
  const majorVersion = await detectElasticsearchVersion(config);
  
  // Use legacy client for ES5 and ES6
  if (majorVersion <= 6) {
    logger.info('Using legacy client for ES5/6', { version: majorVersion });
    return createLegacyElasticsearchClient(config);
  }
  
  // Use official client for ES7+
  logger.info('Using official client for ES7+', { version: majorVersion });
  
  const clientConfig = {
    node: config.url,
    requestTimeout: 60000,
    maxRetries: 3
  };

  // Add authentication if provided
  if (config.user && config.password) {
    clientConfig.auth = {
      username: config.user,
      password: config.password
    };
  }

  // Configure SSL/TLS
  if (config.ssl) {
    clientConfig.tls = {
      rejectUnauthorized: config.rejectUnauthorized
    };
  }

  logger.info('Creating Elasticsearch client', { url: config.url, ssl: config.ssl });
  
  return new Client(clientConfig);
}

/**
 * Create Elasticsearch client synchronously (for compatibility)
 * Uses legacy client by default
 * @param {object} config - Elasticsearch configuration
 * @returns {LegacyElasticsearchClient} Legacy client instance
 */
export function createElasticsearchClientSync(config) {
  logger.info('Creating legacy Elasticsearch client (sync)', { url: config.url });
  return createLegacyElasticsearchClient(config);
}

/**
 * Test Elasticsearch connection
 * @param {Client|LegacyElasticsearchClient} client - Elasticsearch client
 * @returns {Promise<object>} Connection info
 */
export async function testConnection(client) {
  try {
    logger.info('Testing Elasticsearch connection');
    const info = await client.info();
    
    const cluster = info.cluster_name || 'unknown';
    const version = info.version?.number || 'unknown';
    const name = info.name || 'unknown';
    
    logger.info('Connection successful', { cluster, version });
    
    return {
      success: true,
      cluster,
      version,
      name
    };
  } catch (error) {
    logger.error('Connection failed', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get cluster health
 * @param {Client|LegacyElasticsearchClient} client - Elasticsearch client
 * @returns {Promise<object>} Cluster health information
 */
export async function getClusterHealth(client) {
  try {
    const health = await client.cluster().health();
    logger.debug('Cluster health retrieved', { status: health.status });
    return health;
  } catch (error) {
    logger.error('Failed to get cluster health', { error: error.message });
    throw error;
  }
}

/**
 * Close Elasticsearch client connection
 * @param {Client|LegacyElasticsearchClient} client - Elasticsearch client
 */
export async function closeClient(client) {
  try {
    await client.close();
    logger.info('Elasticsearch client closed');
  } catch (error) {
    logger.error('Error closing client', { error: error.message });
  }
}

export default {
  createElasticsearchClient,
  testConnection,
  getClusterHealth,
  closeClient
};
