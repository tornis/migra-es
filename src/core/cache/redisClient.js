import Redis from 'ioredis';
import { createLogger } from '../../utils/logger.js';
import config from '../../utils/config.js';

const logger = createLogger('RedisClient');

let redisClient = null;

/**
 * Create and configure Redis client
 * @returns {Redis} Redis client instance
 */
export function createRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const redisConfig = {
    host: config.redis.host,
    port: config.redis.port,
    db: config.redis.db,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      logger.debug('Redis retry attempt', { times, delay });
      return delay;
    },
    maxRetriesPerRequest: 3
  };

  if (config.redis.password) {
    redisConfig.password = config.redis.password;
  }

  logger.info('Creating Redis client', { 
    host: config.redis.host, 
    port: config.redis.port 
  });

  redisClient = new Redis(redisConfig);

  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('error', (error) => {
    logger.error('Redis client error', { error: error.message });
  });

  redisClient.on('close', () => {
    logger.warn('Redis client connection closed');
  });

  return redisClient;
}

/**
 * Get Redis client instance
 * @returns {Redis} Redis client instance
 */
export function getRedisClient() {
  if (!redisClient) {
    return createRedisClient();
  }
  return redisClient;
}

/**
 * Test Redis connection
 * @returns {Promise<boolean>} True if connected
 */
export async function testRedisConnection() {
  try {
    const client = getRedisClient();
    await client.ping();
    logger.info('Redis connection test successful');
    return true;
  } catch (error) {
    logger.error('Redis connection test failed', { error: error.message });
    return false;
  }
}

/**
 * Close Redis connection
 * @returns {Promise<void>}
 */
export async function closeRedisClient() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client closed');
  }
}

/**
 * Set value with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<void>}
 */
export async function set(key, value, ttl = config.migration.cacheTTL) {
  try {
    const client = getRedisClient();
    const serialized = JSON.stringify(value);
    await client.setex(key, ttl, serialized);
    logger.debug('Cache set', { key, ttl });
  } catch (error) {
    logger.error('Failed to set cache', { key, error: error.message });
    throw error;
  }
}

/**
 * Get value from cache
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value or null
 */
export async function get(key) {
  try {
    const client = getRedisClient();
    const value = await client.get(key);
    if (value) {
      logger.debug('Cache hit', { key });
      return JSON.parse(value);
    }
    logger.debug('Cache miss', { key });
    return null;
  } catch (error) {
    logger.error('Failed to get cache', { key, error: error.message });
    return null;
  }
}

/**
 * Delete key from cache
 * @param {string} key - Cache key
 * @returns {Promise<void>}
 */
export async function del(key) {
  try {
    const client = getRedisClient();
    await client.del(key);
    logger.debug('Cache deleted', { key });
  } catch (error) {
    logger.error('Failed to delete cache', { key, error: error.message });
  }
}

/**
 * Check if key exists
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if exists
 */
export async function exists(key) {
  try {
    const client = getRedisClient();
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Failed to check cache existence', { key, error: error.message });
    return false;
  }
}

/**
 * Increment counter
 * @param {string} key - Counter key
 * @returns {Promise<number>} New value
 */
export async function incr(key) {
  try {
    const client = getRedisClient();
    const value = await client.incr(key);
    return value;
  } catch (error) {
    logger.error('Failed to increment counter', { key, error: error.message });
    throw error;
  }
}

/**
 * Get multiple keys
 * @param {Array<string>} keys - Array of keys
 * @returns {Promise<Array<any>>} Array of values
 */
export async function mget(keys) {
  try {
    const client = getRedisClient();
    const values = await client.mget(...keys);
    return values.map(v => v ? JSON.parse(v) : null);
  } catch (error) {
    logger.error('Failed to get multiple keys', { error: error.message });
    return [];
  }
}

export default {
  createRedisClient,
  getRedisClient,
  testRedisConnection,
  closeRedisClient,
  set,
  get,
  del,
  exists,
  incr,
  mget
};
