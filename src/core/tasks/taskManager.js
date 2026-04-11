import { v4 as uuidv4 } from 'uuid';
import Bull from 'bull';
import { createLogger } from '../../utils/logger.js';
import config from '../../utils/config.js';
import { saveTask, getTask, getAllTasks, updateTaskStatus, updateTaskProgress } from '../../database/db.js';
import { getRedisClient } from '../cache/redisClient.js';
import { createElasticsearchClient } from '../elasticsearch/client.js';
import { indexExists, deleteIndex } from '../elasticsearch/indexManager.js';
import { clearIndexCache } from '../cache/cacheStrategy.js';

const logger = createLogger('TaskManager');

// ─── Queue instances ─────────────────────────────────────────────────────────

let readerQueue = null;
let writerQueue = null;

const REDIS_CFG = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
};

const DEFAULT_JOB_OPTS = {
  removeOnComplete: false,
  removeOnFail: false,
};

// ─── Initialisation ──────────────────────────────────────────────────────────

export function initReaderQueue() {
  if (readerQueue) return readerQueue;

  readerQueue = new Bull('migration-reader', { redis: REDIS_CFG, defaultJobOptions: DEFAULT_JOB_OPTS });

  readerQueue.on('completed', async (job) => {
    const { taskId } = job.data;
    logger.info('Reader job completed', { taskId });
    await _checkCompletion(taskId);
  });

  readerQueue.on('failed', async (job, err) => {
    const { taskId } = job.data;
    logger.error('Reader job failed', { taskId, error: err.message });
    const task = await getTask(taskId);
    if (task && task.status !== 'cancelled') {
      task.error = err.message;
      await saveTask(task);
      await updateTaskStatus(taskId, 'failed');
    }
  });

  logger.info('Reader queue initialised');
  return readerQueue;
}

export function initWriterQueue() {
  if (writerQueue) return writerQueue;

  writerQueue = new Bull('migration-writer', { redis: REDIS_CFG, defaultJobOptions: DEFAULT_JOB_OPTS });

  writerQueue.on('completed', async (job) => {
    const { taskId } = job.data;
    const redis = getRedisClient();
    await redis.decr(`migration:${taskId}:pending`);
    await _checkCompletion(taskId);
  });

  writerQueue.on('failed', async (job, err) => {
    const { taskId } = job.data;
    const redis = getRedisClient();
    // Count failed docs from job result if available
    await redis.decr(`migration:${taskId}:pending`);
    logger.error('Writer job failed (after retries)', { taskId, error: err.message });
    await _checkCompletion(taskId);
  });

  logger.info('Writer queue initialised');
  return writerQueue;
}

export function getReaderQueue() {
  if (!readerQueue) return initReaderQueue();
  return readerQueue;
}

export function getWriterQueue() {
  if (!writerQueue) return initWriterQueue();
  return writerQueue;
}

// ─── Completion helper ───────────────────────────────────────────────────────

async function _checkCompletion(taskId) {
  try {
    const task = await getTask(taskId);
    if (!task || !['running', 'paused'].includes(task.status)) return;
    if (!task.progress?.readerDone) return;

    const redis = getRedisClient();
    const [pending, written, failed] = await Promise.all([
      redis.get(`migration:${taskId}:pending`).then(v => parseInt(v || '0', 10)),
      redis.get(`migration:${taskId}:written`).then(v => parseInt(v || '0', 10)),
      redis.get(`migration:${taskId}:failed`).then(v => parseInt(v || '0', 10)),
    ]);

    if (pending <= 0) {
      // Persist final counters to DB before marking complete so the
      // dashboard keeps showing the correct numbers after Redis keys expire.
      await updateTaskProgress(taskId, {
        ...task.progress,
        written,
        failed,
        processed: written,
      });
      await updateTaskStatus(taskId, 'completed');
      logger.info('Task completed', { taskId, written, failed });
    }
  } catch (err) {
    logger.error('_checkCompletion error', { taskId, error: err.message });
  }
}

// ─── Task CRUD ───────────────────────────────────────────────────────────────

export async function createMigrationTask(cfg) {
  const taskId = uuidv4();

  const task = {
    id: taskId,
    name: cfg.name || `Migration: ${cfg.indexName}`,
    sourceConfig: cfg.sourceConfig,
    destConfig: cfg.destConfig,
    indexName: cfg.indexName,
    controlField: cfg.controlField,
    status: 'pending',
    progress: {
      total: 0,
      enqueued: 0,
      written: 0,
      failed: 0,
      lastControlValue: null,
      readerDone: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveTask(task);
  logger.info('Migration task created', { taskId, indexName: cfg.indexName });
  return task;
}

export async function startMigrationTask(taskId) {
  const task = await getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status === 'running') throw new Error(`Task already running: ${taskId}`);

  const redis = getRedisClient();

  // Clear any leftover flags and initialise counters
  await Promise.all([
    redis.del(`migration:${taskId}:paused`),
    redis.del(`migration:${taskId}:cancelled`),
    redis.set(`migration:${taskId}:pending`, '0', 'EX', 86400 * 7),
    redis.set(`migration:${taskId}:written`, '0', 'EX', 86400 * 7),
    redis.set(`migration:${taskId}:failed`,  '0', 'EX', 86400 * 7),
  ]);

  const queue = getReaderQueue();
  await queue.add(
    {
      taskId,
      sourceConfig: task.sourceConfig,
      destConfig: task.destConfig,
      indexName: task.indexName,
      controlField: task.controlField,
      lastControlValue: null,
    },
    { jobId: `reader:${taskId}:${Date.now()}` }
  );

  await updateTaskStatus(taskId, 'running');
  logger.info('Migration task started', { taskId });
}

export async function pauseMigrationTask(taskId) {
  const redis = getRedisClient();
  await redis.set(`migration:${taskId}:paused`, '1', 'EX', 86400);
  await updateTaskStatus(taskId, 'paused');
  logger.info('Migration task pause requested', { taskId });
}

export async function resumeMigrationTask(taskId) {
  const task = await getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status !== 'paused') throw new Error(`Task is not paused: ${taskId}`);

  const redis = getRedisClient();
  await redis.del(`migration:${taskId}:paused`);

  // Re-initialise counters (accumulated written/failed stay in Redis from before)
  await redis.set(`migration:${taskId}:pending`, '0', 'EX', 86400 * 7);

  const queue = getReaderQueue();
  await queue.add(
    {
      taskId,
      sourceConfig: task.sourceConfig,
      destConfig: task.destConfig,
      indexName: task.indexName,
      controlField: task.controlField,
      lastControlValue: task.progress?.lastControlValue ?? null,
    },
    { jobId: `reader:${taskId}:${Date.now()}` }
  );

  // Keep existing written/failed counts — update progress to clear readerDone
  await updateTaskProgress(taskId, { readerDone: false });
  await updateTaskStatus(taskId, 'running');
  logger.info('Migration task resumed', { taskId, from: task.progress?.lastControlValue });
}

export async function cancelMigrationTask(taskId) {
  const redis = getRedisClient();
  await redis.set(`migration:${taskId}:cancelled`, '1', 'EX', 86400);

  // Remove waiting writer jobs for this task to avoid unnecessary processing
  try {
    const wq = getWriterQueue();
    const waiting = await wq.getWaiting();
    for (const job of waiting) {
      if (job.data.taskId === taskId) {
        const bk = job.data.batchKey;
        if (bk) await redis.del(bk);
        await job.remove();
      }
    }
  } catch (err) {
    logger.warn('Could not clean writer jobs on cancel', { taskId, error: err.message });
  }

  await updateTaskStatus(taskId, 'cancelled');
  logger.info('Migration task cancelled', { taskId });
}

// ─── Status & enrichment ────────────────────────────────────────────────────

export async function getTaskStatus(taskId) {
  const task = await getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const redis = getRedisClient();
  const [written, failed, pending] = await Promise.all([
    redis.get(`migration:${taskId}:written`).then(v => parseInt(v || '0', 10)),
    redis.get(`migration:${taskId}:failed`).then(v => parseInt(v || '0', 10)),
    redis.get(`migration:${taskId}:pending`).then(v => parseInt(v || '0', 10)),
  ]);

  return {
    ...task,
    progress: {
      ...task.progress,
      written,
      failed,
      processed: written,  // backward compat for ProgressMonitor
      pending,
    },
  };
}

/**
 * Load all tasks enriched with live Redis counters.
 * Use this instead of getAllTasks() when you need live progress.
 */
export async function getEnrichedTasks() {
  const tasks = await getAllTasks();
  const redis = getRedisClient();

  return Promise.all(
    tasks.map(async task => {
      const isActive = ['running', 'paused'].includes(task.status);

      // For active tasks always use Redis (source of truth).
      // For finished tasks prefer the value already persisted in the DB;
      // fall back to Redis in case the task completed before the DB write.
      const [redisWritten, redisFailed, redisPending] = await Promise.all([
        redis.get(`migration:${task.id}:written`).then(v => parseInt(v || '0', 10)),
        redis.get(`migration:${task.id}:failed`).then(v => parseInt(v || '0', 10)),
        redis.get(`migration:${task.id}:pending`).then(v => parseInt(v || '0', 10)),
      ]);

      const dbWritten  = task.progress?.written  ?? task.progress?.processed ?? 0;
      const dbFailed   = task.progress?.failed   ?? 0;

      // Use whichever source has the higher value (handles race between DB write and Redis)
      const written  = isActive ? redisWritten  : Math.max(dbWritten,  redisWritten);
      const failed   = isActive ? redisFailed   : Math.max(dbFailed,   redisFailed);
      const pending  = isActive ? redisPending  : 0;

      return {
        ...task,
        progress: {
          ...task.progress,
          written,
          failed,
          processed: written,
          pending,
        },
      };
    })
  );
}

/**
 * Reprocess a completed (or failed) migration.
 * Deletes the destination index and starts a fresh migration task
 * with the same configuration. The original task record is preserved
 * in the DB as history.
 *
 * @param {string} taskId - ID of the original task to reprocess
 * @returns {Promise<object>} The newly created task
 */
export async function reprocessMigrationTask(taskId) {
  const task = await getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  logger.warn('Reprocessing migration — deleting destination index', {
    taskId,
    indexName: task.indexName,
    destUrl: task.destConfig?.url,
  });

  // Delete the destination index so it can be recreated clean
  let destClient = null;
  try {
    destClient = await createElasticsearchClient(task.destConfig);
    const exists = await indexExists(destClient, task.indexName);
    if (exists) {
      await deleteIndex(destClient, task.indexName);
      logger.info('Destination index deleted', { indexName: task.indexName });
    } else {
      logger.info('Destination index did not exist, skipping delete', { indexName: task.indexName });
    }
  } finally {
    if (destClient) await destClient.close().catch(() => {});
  }

  // Clear cached mapping/settings so the engine re-reads from source
  await clearIndexCache(task.indexName).catch(() => {});

  // Create a fresh task with the same config (original task kept as history)
  const newTask = await createMigrationTask({
    name: `Reprocessamento: ${task.indexName}`,
    sourceConfig: task.sourceConfig,
    destConfig: task.destConfig,
    indexName: task.indexName,
    controlField: task.controlField,
  });

  await startMigrationTask(newTask.id);

  logger.info('Reprocess task started', {
    originalTaskId: taskId,
    newTaskId: newTask.id,
    indexName: task.indexName,
  });

  return newTask;
}

export async function cleanCompletedJobs(grace = 86400000) {
  const rq = getReaderQueue();
  const wq = getWriterQueue();
  await Promise.all([
    rq.clean(grace, 'completed'),
    rq.clean(grace, 'failed'),
    wq.clean(grace, 'completed'),
    wq.clean(grace, 'failed'),
  ]);
  logger.info('Completed jobs cleaned', { grace });
}

export async function closeQueues() {
  if (readerQueue) { await readerQueue.close(); readerQueue = null; }
  if (writerQueue) { await writerQueue.close(); writerQueue = null; }
  logger.info('Queues closed');
}

export default {
  initReaderQueue, initWriterQueue,
  getReaderQueue, getWriterQueue,
  createMigrationTask, startMigrationTask,
  pauseMigrationTask, resumeMigrationTask, cancelMigrationTask,
  getTaskStatus, getEnrichedTasks,
  cleanCompletedJobs, closeQueues,
};
