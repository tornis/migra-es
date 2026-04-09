import { z } from 'zod';

/**
 * Elasticsearch connection configuration schema
 */
export const ElasticsearchConfigSchema = z.object({
  url: z.string().url('Invalid URL format'),
  user: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().default(false),
  rejectUnauthorized: z.boolean().default(true)
});

/**
 * Migration task configuration schema
 */
export const MigrationTaskSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Task name is required'),
  sourceConfig: ElasticsearchConfigSchema,
  destConfig: ElasticsearchConfigSchema,
  indexName: z.string().min(1, 'Index name is required'),
  controlField: z.string().min(1, 'Control field is required'),
  status: z.enum(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  progress: z.object({
    total: z.number().int().nonnegative(),
    processed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    lastControlValue: z.any().optional()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional()
});

/**
 * Validate Elasticsearch connection configuration
 * @param {object} config - Configuration object
 * @returns {object} Validated configuration
 */
export function validateElasticsearchConfig(config) {
  return ElasticsearchConfigSchema.parse(config);
}

/**
 * Validate migration task configuration
 * @param {object} task - Task object
 * @returns {object} Validated task
 */
export function validateMigrationTask(task) {
  return MigrationTaskSchema.parse(task);
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function isValidUrl(url) {
  try {
    z.string().url().parse(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate field name (alphanumeric, underscore, dot)
 * @param {string} fieldName - Field name to validate
 * @returns {boolean} True if valid
 */
export function isValidFieldName(fieldName) {
  const fieldNameRegex = /^[a-zA-Z0-9_.]+$/;
  return fieldNameRegex.test(fieldName);
}

export default {
  ElasticsearchConfigSchema,
  MigrationTaskSchema,
  validateElasticsearchConfig,
  validateMigrationTask,
  isValidUrl,
  isValidFieldName
};
