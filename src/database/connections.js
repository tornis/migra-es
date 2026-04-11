import { randomUUID } from 'crypto';
import { getDatabase } from './db.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Connections');

/**
 * Ensure the connections array exists in the database
 * @param {object} db - Database instance
 */
function ensureConnections(db) {
  if (!db.data.connections) {
    db.data.connections = [];
  }
}

/**
 * Get all saved connection profiles
 * @returns {Promise<Array>} List of connection profiles
 */
export async function getAllConnections() {
  const db = await getDatabase();
  ensureConnections(db);
  logger.debug('Retrieved all connections', { count: db.data.connections.length });
  return db.data.connections;
}

/**
 * Save a connection profile (create or update)
 * @param {object} connection - Connection profile
 * @returns {Promise<object>} Saved connection
 */
export async function saveConnection(connection) {
  const db = await getDatabase();
  ensureConnections(db);

  const id = connection.id || randomUUID();
  const now = new Date().toISOString();

  const existing = db.data.connections.findIndex(c => c.id === id);

  if (existing >= 0) {
    db.data.connections[existing] = {
      ...db.data.connections[existing],
      ...connection,
      id,
      updatedAt: now,
    };
    logger.info('Connection updated', { id, name: connection.name });
  } else {
    db.data.connections.push({
      ...connection,
      id,
      createdAt: now,
      updatedAt: now,
    });
    logger.info('Connection created', { id, name: connection.name });
  }

  await db.write();
  return { ...connection, id };
}

/**
 * Delete a connection profile
 * @param {string} id - Connection ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteConnection(id) {
  const db = await getDatabase();
  ensureConnections(db);

  const before = db.data.connections.length;
  db.data.connections = db.data.connections.filter(c => c.id !== id);

  if (db.data.connections.length < before) {
    await db.write();
    logger.info('Connection deleted', { id });
    return true;
  }

  logger.warn('Connection not found for deletion', { id });
  return false;
}
