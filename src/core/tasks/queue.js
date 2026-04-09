import { getQueue } from './taskManager.js';
import { createLogger } from '../../utils/logger.js';
import { performMigration } from '../migration/migrationEngine.js';

const logger = createLogger('QueueProcessor');

/**
 * Initialize queue processor
 */
export function initQueueProcessor() {
  const queue = getQueue();

  // Process migration jobs
  queue.process(async (job) => {
    logger.info('Processing migration job', { 
      jobId: job.id, 
      taskId: job.data.taskId 
    });

    try {
      const result = await performMigration(job.data, (progress) => {
        // Update job progress
        job.progress(progress);
      });

      logger.info('Migration job completed successfully', { 
        jobId: job.id,
        taskId: job.data.taskId,
        result
      });

      return result;
    } catch (error) {
      logger.error('Migration job failed', { 
        jobId: job.id,
        taskId: job.data.taskId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  });

  logger.info('Queue processor initialized');
}

export default {
  initQueueProcessor
};
