import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';
import { createLogger } from '../utils/logger.js';
import config from '../utils/config.js';

const logger = createLogger('Database');

let db = null;

/**
 * Initialize database
 * @returns {Promise<Low>} Database instance
 */
export async function initDatabase() {
  if (db) {
    return db;
  }

  // Ensure data directory exists
  const dataDir = config.app.dataDir;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    logger.info('Data directory created', { path: dataDir });
  }

  const dbPath = path.join(dataDir, 'tasks.json');
  const adapter = new JSONFile(dbPath);
  
  db = new Low(adapter, { tasks: [] });
  
  await db.read();
  
  // Initialize default data if empty
  if (!db.data) {
    db.data = { tasks: [] };
    await db.write();
  }

  logger.info('Database initialized', { path: dbPath });
  return db;
}

/**
 * Get database instance
 * @returns {Promise<Low>} Database instance
 */
export async function getDatabase() {
  if (!db) {
    return await initDatabase();
  }
  return db;
}

/**
 * Save task to database
 * @param {object} task - Task object
 * @returns {Promise<object>} Saved task
 */
export async function saveTask(task) {
  const database = await getDatabase();
  
  // Check if task exists
  const existingIndex = database.data.tasks.findIndex(t => t.id === task.id);
  
  if (existingIndex >= 0) {
    // Update existing task
    database.data.tasks[existingIndex] = {
      ...database.data.tasks[existingIndex],
      ...task,
      updatedAt: new Date().toISOString()
    };
    logger.debug('Task updated', { taskId: task.id });
  } else {
    // Add new task
    database.data.tasks.push({
      ...task,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    logger.info('Task created', { taskId: task.id });
  }
  
  await database.write();
  return task;
}

/**
 * Get task by ID
 * @param {string} taskId - Task ID
 * @returns {Promise<object|null>} Task object or null
 */
export async function getTask(taskId) {
  const database = await getDatabase();
  const task = database.data.tasks.find(t => t.id === taskId);
  
  if (task) {
    logger.debug('Task retrieved', { taskId });
  } else {
    logger.debug('Task not found', { taskId });
  }
  
  return task || null;
}

/**
 * Get all tasks
 * @returns {Promise<Array<object>>} Array of tasks
 */
export async function getAllTasks() {
  const database = await getDatabase();
  logger.debug('Retrieved all tasks', { count: database.data.tasks.length });
  return database.data.tasks;
}

/**
 * Get tasks by status
 * @param {string} status - Task status
 * @returns {Promise<Array<object>>} Array of tasks
 */
export async function getTasksByStatus(status) {
  const database = await getDatabase();
  const tasks = database.data.tasks.filter(t => t.status === status);
  logger.debug('Retrieved tasks by status', { status, count: tasks.length });
  return tasks;
}

/**
 * Update task status
 * @param {string} taskId - Task ID
 * @param {string} status - New status
 * @returns {Promise<object|null>} Updated task or null
 */
export async function updateTaskStatus(taskId, status) {
  const database = await getDatabase();
  const task = database.data.tasks.find(t => t.id === taskId);
  
  if (!task) {
    logger.warn('Task not found for status update', { taskId });
    return null;
  }
  
  task.status = status;
  task.updatedAt = new Date().toISOString();
  
  if (status === 'running' && !task.startedAt) {
    task.startedAt = new Date().toISOString();
  }
  
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    task.completedAt = new Date().toISOString();
  }
  
  await database.write();
  logger.info('Task status updated', { taskId, status });
  
  return task;
}

/**
 * Update task progress
 * @param {string} taskId - Task ID
 * @param {object} progress - Progress data
 * @returns {Promise<object|null>} Updated task or null
 */
export async function updateTaskProgress(taskId, progress) {
  const database = await getDatabase();
  const task = database.data.tasks.find(t => t.id === taskId);
  
  if (!task) {
    logger.warn('Task not found for progress update', { taskId });
    return null;
  }
  
  task.progress = {
    ...task.progress,
    ...progress
  };
  task.updatedAt = new Date().toISOString();
  
  await database.write();
  logger.debug('Task progress updated', { taskId, progress });
  
  return task;
}

/**
 * Delete task
 * @param {string} taskId - Task ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteTask(taskId) {
  const database = await getDatabase();
  const initialLength = database.data.tasks.length;
  
  database.data.tasks = database.data.tasks.filter(t => t.id !== taskId);
  
  if (database.data.tasks.length < initialLength) {
    await database.write();
    logger.info('Task deleted', { taskId });
    return true;
  }
  
  logger.warn('Task not found for deletion', { taskId });
  return false;
}

/**
 * Clear all completed tasks
 * @returns {Promise<number>} Number of tasks deleted
 */
export async function clearCompletedTasks() {
  const database = await getDatabase();
  const initialLength = database.data.tasks.length;
  
  database.data.tasks = database.data.tasks.filter(
    t => t.status !== 'completed' && t.status !== 'cancelled'
  );
  
  const deleted = initialLength - database.data.tasks.length;
  
  if (deleted > 0) {
    await database.write();
    logger.info('Completed tasks cleared', { count: deleted });
  }
  
  return deleted;
}

export default {
  initDatabase,
  getDatabase,
  saveTask,
  getTask,
  getAllTasks,
  getTasksByStatus,
  updateTaskStatus,
  updateTaskProgress,
  deleteTask,
  clearCompletedTasks
};
