import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MappingConverter');

// ── Vector field conversion helpers ──────────────────────────────────────────

/**
 * Map Elasticsearch similarity names to OpenSearch space_type values.
 */
const ES_SIMILARITY_TO_OS_SPACE = {
  cosine:             'cosinesimil',
  dot_product:        'innerproduct',
  l2_norm:            'l2',
  max_inner_product:  'innerproduct',
};

/**
 * Map OpenSearch space_type values to Elasticsearch similarity names.
 */
const OS_SPACE_TO_ES_SIMILARITY = {
  cosinesimil:   'cosine',
  innerproduct:  'dot_product',
  l2:            'l2_norm',
};

function toOsSpaceType(esSimilarity) {
  return ES_SIMILARITY_TO_OS_SPACE[esSimilarity] ?? 'cosinesimil';
}

function toEsSimilarity(osSpaceType) {
  return OS_SPACE_TO_ES_SIMILARITY[osSpaceType] ?? 'cosine';
}

/**
 * Convert a single field config between ES dense_vector ↔ OS knn_vector.
 * Returns the original fieldConfig unchanged when no conversion is needed.
 */
function convertVectorField(fieldConfig, srcEngine, destEngine) {
  // ES → OpenSearch: dense_vector → knn_vector
  if (srcEngine === 'elasticsearch' && destEngine === 'opensearch') {
    if (fieldConfig.type === 'dense_vector') {
      const dims      = fieldConfig.dims ?? fieldConfig.dimension ?? 128;
      const spaceType = toOsSpaceType(fieldConfig.similarity);

      logger.debug('Converting dense_vector → knn_vector', { dims, spaceType });

      return {
        type:      'knn_vector',
        dimension: dims,
        method: {
          name:       'hnsw',
          space_type: spaceType,
          engine:     'nmslib',
          parameters: { ef_construction: 128, m: 16 },
        },
      };
    }
  }

  // OpenSearch → ES: knn_vector → dense_vector
  if (srcEngine === 'opensearch' && destEngine === 'elasticsearch') {
    if (fieldConfig.type === 'knn_vector') {
      const dims       = fieldConfig.dimension ?? fieldConfig.dims ?? 128;
      const spaceType  = fieldConfig.method?.space_type;
      const similarity = toEsSimilarity(spaceType);

      logger.debug('Converting knn_vector → dense_vector', { dims, similarity });

      return {
        type:       'dense_vector',
        dims,
        index:      true,
        similarity,
      };
    }
  }

  // No vector conversion needed — return as-is
  return fieldConfig;
}

/**
 * Recursively convert vector fields within a properties map.
 */
function convertVectorProperties(properties, srcEngine, destEngine) {
  const result = {};
  for (const [name, fieldConfig] of Object.entries(properties)) {
    const converted = convertVectorField(fieldConfig, srcEngine, destEngine);

    // Recurse into nested/object fields
    if (converted.properties) {
      result[name] = {
        ...converted,
        properties: convertVectorProperties(converted.properties, srcEngine, destEngine),
      };
    } else {
      result[name] = converted;
    }
  }
  return result;
}

/**
 * Apply cross-solution vector field conversion to a full mapping object.
 * No-op when srcEngine === destEngine.
 *
 * @param {object} mapping
 * @param {string} srcEngine  'elasticsearch' | 'opensearch'
 * @param {string} destEngine 'elasticsearch' | 'opensearch'
 * @returns {object}
 */
export function convertVectorFields(mapping, srcEngine, destEngine) {
  if (!mapping || !mapping.properties || srcEngine === destEngine) return mapping;

  logger.info('Applying vector field conversion', { srcEngine, destEngine });

  return {
    ...mapping,
    properties: convertVectorProperties(mapping.properties, srcEngine, destEngine),
  };
}

/**
 * Detect whether a mapping contains any vector fields.
 * @param {object} mapping
 * @returns {boolean}
 */
export function hasVectorFields(mapping) {
  if (!mapping?.properties) return false;
  return hasVectorInProperties(mapping.properties);
}

function hasVectorInProperties(properties) {
  for (const fieldConfig of Object.values(properties)) {
    if (fieldConfig.type === 'dense_vector' || fieldConfig.type === 'knn_vector') return true;
    if (fieldConfig.properties && hasVectorInProperties(fieldConfig.properties)) return true;
  }
  return false;
}

// ── Legacy ES5 → ES9 mapping conversion ──────────────────────────────────────

/**
 * Convert Elasticsearch 5 mapping to ES9 / OpenSearch compatible mapping.
 *
 * @param {object} es5Mapping
 * @param {string} [srcEngine='elasticsearch']  - Source engine type
 * @param {string} [destEngine='elasticsearch'] - Destination engine type
 * @returns {object} ES9/OpenSearch compatible mapping
 */
export function convertMapping(es5Mapping, srcEngine = 'elasticsearch', destEngine = 'elasticsearch') {
  logger.info('Converting mapping', { srcEngine, destEngine });

  if (!es5Mapping || typeof es5Mapping !== 'object') {
    logger.warn('Invalid mapping provided, returning empty mapping');
    return { properties: {} };
  }

  const es9Mapping = { properties: {} };

  // Handle ES5 typed mapping (type_name → properties)
  let sourceProperties = es5Mapping.properties;
  let hasTypedMapping  = false;

  if (!sourceProperties && es5Mapping) {
    const keys = Object.keys(es5Mapping);
    if (keys.length > 0 && es5Mapping[keys[0]]?.properties) {
      sourceProperties = es5Mapping[keys[0]].properties;
      hasTypedMapping  = true;
      logger.debug('Detected ES5 typed mapping, extracting properties');
    }
  }

  if (!sourceProperties) {
    logger.warn('No properties found in mapping');
    return es9Mapping;
  }

  es9Mapping.properties = convertProperties(sourceProperties);

  if (hasTypedMapping && !es9Mapping.properties.source_type) {
    es9Mapping.properties.source_type = { type: 'keyword' };
    logger.debug('Added source_type keyword to preserve ES5 _type metadata');
  }

  if (es5Mapping._source) {
    es9Mapping._source = { ...es5Mapping._source };
  }

  if (es5Mapping.dynamic_templates) {
    es9Mapping.dynamic_templates = convertDynamicTemplates(es5Mapping.dynamic_templates);
  }

  // Apply cross-solution vector field conversion
  const finalMapping = convertVectorFields(es9Mapping, srcEngine, destEngine);

  logger.info('Mapping conversion completed');
  return finalMapping;
}

// ── Field-level converters ────────────────────────────────────────────────────

function convertProperties(properties) {
  const converted = {};
  for (const [fieldName, fieldConfig] of Object.entries(properties)) {
    converted[fieldName] = convertFieldMapping(fieldConfig);
  }
  return converted;
}

function convertFieldMapping(fieldConfig) {
  const converted = { ...fieldConfig };

  // Convert ES5 'string' type
  if (fieldConfig.type === 'string') {
    if (
      fieldConfig.index === 'not_analyzed' ||
      fieldConfig.index === false ||
      fieldConfig.analyzer === 'keyword'
    ) {
      converted.type = 'keyword';
    } else {
      converted.type = 'text';
      if (!converted.fields) converted.fields = {};
      if (!converted.fields.keyword) {
        converted.fields.keyword = { type: 'keyword', ignore_above: 256 };
      }
    }

    if (
      typeof converted.index === 'boolean' ||
      converted.index === 'not_analyzed' ||
      converted.index === 'analyzed'
    ) {
      delete converted.index;
    }
  }

  // Normalise index string values
  if (typeof converted.index === 'string') {
    if (converted.index === 'no' || converted.index === 'not_analyzed') {
      converted.index = false;
    } else if (converted.index === 'analyzed') {
      converted.index = true;
    }
  }

  // Remove deprecated fields
  if (converted.include_in_all !== undefined) {
    delete converted.include_in_all;
  }

  if (converted.index_name !== undefined) {
    delete converted.index_name;
  }

  // Date format normalisation
  if (converted.type === 'date' && converted.format) {
    converted.format = updateDateFormat(converted.format);
  }

  // geo_point cleanup
  if (converted.type === 'geo_point') {
    delete converted.lat_lon;
    delete converted.geohash;
  }

  // Recurse
  if (converted.properties) {
    converted.properties = convertProperties(converted.properties);
  }
  if (converted.fields) {
    converted.fields = convertProperties(converted.fields);
  }

  return converted;
}

function updateDateFormat(format) {
  return format.replace(/YYYY/g, 'yyyy').replace(/DD/g, 'dd');
}

function convertDynamicTemplates(templates) {
  return templates.map(template => {
    const converted = {};
    for (const [name, tplConfig] of Object.entries(template)) {
      converted[name] = {
        ...tplConfig,
        mapping: convertFieldMapping(tplConfig.mapping || {}),
      };
    }
    return converted;
  });
}

// ── Validation & utilities ────────────────────────────────────────────────────

export function validateMapping(mapping) {
  const issues = [];

  if (!mapping.properties || Object.keys(mapping.properties).length === 0) {
    issues.push('Mapping has no properties defined');
  }
  if (mapping._all !== undefined)       issues.push('_all field is deprecated in ES9/OpenSearch');
  if (mapping._timestamp !== undefined) issues.push('_timestamp field is deprecated');
  if (mapping._ttl !== undefined)       issues.push('_ttl field is deprecated');

  const valid = issues.length === 0;
  if (valid) {
    logger.info('Mapping validation passed');
  } else {
    logger.warn('Mapping validation issues', { issues });
  }
  return { valid, issues };
}

export function extractFieldPaths(mapping, prefix = '') {
  const paths = [];
  if (!mapping?.properties) return paths;

  for (const [fieldName, fieldConfig] of Object.entries(mapping.properties)) {
    const fullPath = prefix ? `${prefix}.${fieldName}` : fieldName;
    paths.push(fullPath);
    if (fieldConfig.properties) {
      paths.push(...extractFieldPaths({ properties: fieldConfig.properties }, fullPath));
    }
  }
  return paths;
}

export default { convertMapping, convertVectorFields, hasVectorFields, validateMapping, extractFieldPaths };
