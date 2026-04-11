import { getWriterQueue } from './taskManager.js';
import { runWriter } from '../migration/migrationEngine.js';
import { createLogger } from '../../utils/logger.js';
import config from '../../utils/config.js';

const logger = createLogger('WriterQueue');

/**
 * Initialise the writer queue processor.
 * Runs with concurrency = workerThreads (default 4) so multiple batches
 * can be indexed simultaneously, saturating the destination cluster.
 */
export function initWriterProcessor() {
  const queue = getWriterQueue();
  const concurrency = Math.max(1, config.migration.workerThreads);

  queue.process(concurrency, async (job) => {
    logger.debug('Processing writer job', {
      jobId: job.id,
      taskId: job.data.taskId,
      batchNum: job.data.batchNum,
      count: job.data.count,
    });

    try {
      const result = await runWriter(job.data);
      return result;
    } catch (err) {
      logger.error('Writer job error', {
        jobId: job.id,
        taskId: job.data.taskId,
        batchNum: job.data.batchNum,
        error: err.message,
      });
      throw err;
    }
  });

  logger.info('Writer queue processor initialised', { concurrency });
}

export default { initWriterProcessor };
