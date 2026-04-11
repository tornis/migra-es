import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Application home directory ────────────────────────────────────────────────
// When installed globally the process CWD is wherever the user runs the command,
// which changes every time. All persistent state goes into ~/.migra-es/ instead.
const APP_DIR = process.env.MIGRA_ES_DIR || path.join(os.homedir(), '.migra-es');

// ── Load .env ─────────────────────────────────────────────────────────────────
// 1. ~/.migra-es/.env  (global install default)
// 2. .env in CWD      (local development / project override — does not override already-set vars)
dotenv.config({ path: path.join(APP_DIR, '.env') });
dotenv.config();

// ── Config object ─────────────────────────────────────────────────────────────

const config = {
  // Elasticsearch Source
  source: {
    url:               process.env.ES_SOURCE_URL || 'http://localhost:9200',
    user:              process.env.ES_SOURCE_USER || '',
    password:          process.env.ES_SOURCE_PASS || '',
    ssl:               process.env.ES_SOURCE_SSL === 'true',
    rejectUnauthorized: process.env.ES_SOURCE_REJECT_UNAUTHORIZED !== 'false',
  },

  // Elasticsearch Destination
  destination: {
    url:               process.env.ES_DEST_URL || 'http://localhost:9200',
    user:              process.env.ES_DEST_USER || '',
    password:          process.env.ES_DEST_PASS || '',
    ssl:               process.env.ES_DEST_SSL === 'true',
    rejectUnauthorized: process.env.ES_DEST_REJECT_UNAUTHORIZED !== 'false',
  },

  // Redis
  redis: {
    host:     process.env.REDIS_HOST || 'localhost',
    port:     parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db:       parseInt(process.env.REDIS_DB || '0', 10),
  },

  // Migration settings
  migration: {
    bulkSize:     parseInt(process.env.BULK_SIZE      || '1000', 10),
    workerThreads: parseInt(process.env.WORKER_THREADS || '4',    10),
    scrollSize:   parseInt(process.env.SCROLL_SIZE    || '5000', 10),
    scrollTimeout: process.env.SCROLL_TIMEOUT || '5m',
    cacheTTL:     parseInt(process.env.CACHE_TTL  || '3600', 10),
    maxRetries:   parseInt(process.env.MAX_RETRIES || '3',    10),
    retryDelay:   parseInt(process.env.RETRY_DELAY || '1000', 10),
  },

  // Logging  — stored under ~/.migra-es/logs/
  logging: {
    level:    process.env.LOG_LEVEL    || 'info',
    dir:      process.env.LOG_DIR      || path.join(APP_DIR, 'logs'),
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    maxSize:  process.env.LOG_MAX_SIZE  || '20m',
  },

  // Application  — data stored under ~/.migra-es/data/
  app: {
    dir:         APP_DIR,
    dataDir:     process.env.DATA_DIR || path.join(APP_DIR, 'data'),
    enableCache: process.env.ENABLE_CACHE !== 'false',
  },
};

export default config;
