import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Resolve log directory the same way config.js does so the logger can be
// imported before config is fully loaded without creating a circular dep.
const APP_DIR = process.env.MIGRA_ES_DIR || path.join(os.homedir(), '.migra-es');
const logDir  = process.env.LOG_DIR || path.join(APP_DIR, 'logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ── Formats ───────────────────────────────────────────────────────────────────

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ── Logger ────────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  transports: [
    // All logs — daily rotation
    new DailyRotateFile({
      filename:    path.join(logDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize:     process.env.LOG_MAX_SIZE  || '20m',
      maxFiles:    process.env.LOG_MAX_FILES || '14d',
      format:      fileFormat,
    }),
    // Errors only — daily rotation
    new DailyRotateFile({
      filename:    path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level:       'error',
      maxSize:     process.env.LOG_MAX_SIZE  || '20m',
      maxFiles:    process.env.LOG_MAX_FILES || '14d',
      format:      fileFormat,
    }),
  ],
  exitOnError: false,
});

/**
 * Create a child logger with a named context label.
 * @param {string} context  e.g. 'MigrationEngine', 'CLI'
 */
export function createLogger(context) {
  return logger.child({ context });
}

export default logger;
