import { v4 as uuidv4 } from 'uuid';
import Bull from 'bull';
import { createLogger } from '../../utils/logger.js';
import config from '../../utils/config.js';
import { saveTask, getTask, updateTaskStatus, updateTaskProgress } from '../../database/db.js';
import { getRedisClient } from '../cache/redisClient.js';

const logger = createLogger('TaskManager');

let migrationQueue = null;

/**
 * Initialize task queue
 * @returns {Bull.Queue} Bull queue instance
 */
export function initQueue() {
  if (migrationQueue) {
    return migrationQueue;
  }

  migrationQueue = new Bull('migration', {
    redis: {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: false,
      removeOnFail: false
    }
  });

  logger.info('Migration queue initialized');

  // Queue event handlers
  migrationQueue.on('completed', async (job, result) => {
    logger.info('Migration job completed', { jobId: job.id, taskId: job.data.taskId });
    await updateTaskStatus(job.data.taskId, 'completed');
  });

  migrationQueue.on('failed', async (job, err) => {
    logger.error('Migration job failed', { 
      jobId: job.id, 
      taskId: job.data.taskId,
      error: err.message 
    });
    const task = await getTask(job.data.taskId);
    if (task) {
      task.error = err.message;
      await saveTask(task);
      await updateTaskStatus(job.data.taskId, 'failed');
    }
  });

  migrationQueue.on('progress', async (job, progress) => {
    logger.debug('Migration job progress', { 
      jobId: job.id, 
      taskId: job.data.taskId,
      progress 
    });
    await updateTaskProgress(job.data.taskId, progress);
  });

  return migrationQueue;
}

/**
 * Get queue instance
 * @returns {Bull.Queue} Bull queue instance
 */
export function getQueue() {
  if (!migrationQueue) {
    return initQueue();
  }
  return migrationQueue;
}

/**
 * Create new migration task
 * @param {object} config - Task configuration
 * @returns {Promise<object>} Created task
 */
export async function createMigrationTask(config) {
  const taskId = uuidv4();
  
  const task = {
    id: taskId,
    name: config.name || `Migration: ${config.indexName}`,
    sourceConfig: config.sourceConfig,
    destConfig: config.destConfig,
    indexName: config.indexName,
    controlField: config.controlField,
    status: 'pending',
    progress: {
      total: 0,
      processed: 0,
      failed: 0,
      lastControlValue: null
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await saveTask(task);
  logger.info('Migration task created', { taskId, indexName: config.indexName });

  return task;
}

/**
 * Start migration task
 * @param {string} taskId - Task ID
 * @returns {Promise<Bull.Job>} Bull job
 */
export async function startMigrationTask(taskId) {
  const task = await getTask(taskId);
  
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  if (task.status === 'running') {
    throw new Error(`Task is already running: ${taskId}`);
  }

  const queue = getQueue();
  
  // Add job to queue
  const job = await queue.add({
    taskId,
    sourceConfig: task.sourceConfig,
    destConfig: task.destConfig,
    indexName: task.indexName,
    controlField: task.controlField
  }, {
    jobId: taskId // Use taskId as jobId for easy tracking
  });

  await updateTaskStatus(taskId, 'running');
  logger.info('Migration task started', { taskId, jobId: job.id });

  return job;
}

/**
 * Pause migration task
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function pauseMigrationTask(taskId) {
  const queue = getQueue();
  const job = await queue.getJob(taskId);
  
  if (job) {
    await job.pause();
    await updateTaskStatus(taskId, 'paused');
    logger.info('Migration task paused', { taskId });
  } else {
    throw new Error(`Job not found for task: ${taskId}`);
  }
}

/**
 * Resume migration task
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function resumeMigrationTask(taskId) {
  const queue = getQueue();
  const job = await queue.getJob(taskId);
  
  if (job) {
    await job.resume();
    await updateTaskStatus(taskId, 'running');
    logger.info('Migration task resumed', { taskId });
  } else {
    throw new Error(`Job not found for task: ${taskId}`);
  }
}

/**
 * Cancel migration task
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function cancelMigrationTask(taskId) {
  const queue = getQueue();
  const job = await queue.getJob(taskId);
  
  if (job) {
    await job.remove();
    await updateTaskStatus(taskId, 'cancelled');
    logger.info('Migration task cancelled', { taskId });
  } else {
    throw new Error(`Job not found for task: ${taskId}`);
  }
}

/**
 * Get task status with job information
 * @param {string} taskId - Task ID
 * @returns {Promise<object>} Task status
 */
export async function getTaskStatus(taskId) {
  const task = await getTask(taskId);
  
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const queue = getQueue();
  const job = await queue.getJob(taskId);
  
  const status = {
    ...task,
    job: null
  };

  if (job) {
    status.job = {
      id: job.id,
      progress: job.progress(),
      state: await job.getState(),
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason
    };
  }

  return status;
}

/**
 * Clean completed jobs
 * @param {number} grace - Grace period in milliseconds
 * @returns {Promise<void>}
 */
export async function cleanCompletedJobs(grace = 86400000) { // 24 hours default
  const queue = getQueue();
  await queue.clean(grace, 'completed');
  await queue.clean(grace, 'failed');
  logger.info('Completed jobs cleaned', { grace });
}

/**
 * Close queue connection
 * @returns {Promise<void>}
 */
export async function closeQueue() {
  if (migrationQueue) {
    await migrationQueue.close();
    migrationQueue = null;
    logger.info('Migration queue closed');
  }
}

export default {
  initQueue,
  getQueue,
  createMigrationTask,
  startMigrationTask,
  pauseMigrationTask,
  resumeMigrationTask,
  cancelMigrationTask,
  getTaskStatus,
  cleanCompletedJobs,
  closeQueue
};
