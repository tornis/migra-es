import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

/**
 * Application configuration
 */
const config = {
  // Elasticsearch Source
  source: {
    url: process.env.ES_SOURCE_URL || 'http://localhost:9200',
    user: process.env.ES_SOURCE_USER || '',
    password: process.env.ES_SOURCE_PASS || '',
    ssl: process.env.ES_SOURCE_SSL === 'true',
    rejectUnauthorized: process.env.ES_SOURCE_REJECT_UNAUTHORIZED !== 'false'
  },

  // Elasticsearch Destination
  destination: {
    url: process.env.ES_DEST_URL || 'http://localhost:9200',
    user: process.env.ES_DEST_USER || '',
    password: process.env.ES_DEST_PASS || '',
    ssl: process.env.ES_DEST_SSL === 'true',
    rejectUnauthorized: process.env.ES_DEST_REJECT_UNAUTHORIZED !== 'false'
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  },

  // Migration settings
  migration: {
    bulkSize: parseInt(process.env.BULK_SIZE || '1000', 10),
    workerThreads: parseInt(process.env.WORKER_THREADS || '4', 10),
    scrollSize: parseInt(process.env.SCROLL_SIZE || '5000', 10),
    scrollTimeout: process.env.SCROLL_TIMEOUT || '5m',
    cacheTTL: parseInt(process.env.CACHE_TTL || '3600', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    maxSize: process.env.LOG_MAX_SIZE || '20m'
  },

  // Application
  app: {
    dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
    enableCache: process.env.ENABLE_CACHE !== 'false'
  }
};

export default config;
