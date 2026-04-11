import { getReaderQueue } from './taskManager.js';
import { runReader } from '../migration/migrationEngine.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ReaderQueue');

/**
 * Initialise the reader queue processor.
 * One job per migration task; reads source ES and enqueues batches.
 */
export function initReaderProcessor() {
  const queue = getReaderQueue();

  // Concurrency = 1 per queue (multiple tasks run their reader jobs sequentially
  // unless we increase this; for now each task still uses its own Bull job so
  // multiple tasks do run in parallel via separate job IDs).
  queue.process(4, async (job) => {
    logger.info('Processing reader job', { jobId: job.id, taskId: job.data.taskId });

    try {
      const result = await runReader(job.data, (progress) => {
        job.progress(progress);
      });

      logger.info('Reader job finished', {
        jobId: job.id,
        taskId: job.data.taskId,
        enqueued: result.enqueued,
        paused: result.paused ?? false,
        cancelled: result.cancelled ?? false,
      });

      return result;
    } catch (err) {
      logger.error('Reader job error', {
        jobId: job.id,
        taskId: job.data.taskId,
        error: err.message,
        stack: err.stack,
      });
      throw err;
    }
  });

  logger.info('Reader queue processor initialised');
}

export default { initReaderProcessor };
