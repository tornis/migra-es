/**
 * Convenience entry-point: initialises both reader and writer queue processors.
 * Called once during application startup from src/cli/index.jsx.
 */
import { initReaderProcessor } from './readerQueue.js';
import { initWriterProcessor } from './writerQueue.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('QueueInit');

export function initQueueProcessor() {
  initReaderProcessor();
  initWriterProcessor();
  logger.info('All queue processors initialised (reader + writer)');
}

export default { initQueueProcessor };
