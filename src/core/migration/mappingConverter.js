import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MappingConverter');

/**
 * Convert Elasticsearch 5 mapping to Elasticsearch 9 compatible mapping
 * @param {object} es5Mapping - ES5 mapping object
 * @returns {object} ES9 compatible mapping
 */
export function convertMapping(es5Mapping) {
  logger.info('Converting ES5 mapping to ES9 format');
  
  if (!es5Mapping || typeof es5Mapping !== 'object') {
    logger.warn('Invalid mapping provided, returning empty mapping');
    return { properties: {} };
  }

  const es9Mapping = {
    properties: {}
  };

  // Handle ES5 type-based mapping structure
  // In ES5, mappings could have types: { "mappings": { "type_name": { "properties": {...} } } }
  // In ES9, types are removed: { "mappings": { "properties": {...} } }
  let sourceProperties = es5Mapping.properties;
  
  if (!sourceProperties && es5Mapping) {
    // Check if this is a typed mapping (ES5 style)
    const keys = Object.keys(es5Mapping);
    if (keys.length > 0 && es5Mapping[keys[0]]?.properties) {
      sourceProperties = es5Mapping[keys[0]].properties;
      logger.debug('Detected ES5 typed mapping, extracting properties');
    }
  }

  if (!sourceProperties) {
    logger.warn('No properties found in mapping');
    return es9Mapping;
  }

  // Convert properties recursively
  es9Mapping.properties = convertProperties(sourceProperties);

  // Remove deprecated _all field if present
  if (es5Mapping._all !== undefined) {
    logger.debug('Removed deprecated _all field');
  }

  // Handle _source configuration
  if (es5Mapping._source) {
    es9Mapping._source = { ...es5Mapping._source };
  }

  // Handle dynamic templates
  if (es5Mapping.dynamic_templates) {
    es9Mapping.dynamic_templates = convertDynamicTemplates(es5Mapping.dynamic_templates);
  }

  logger.info('Mapping conversion completed');
  return es9Mapping;
}

/**
 * Convert properties object recursively
 * @param {object} properties - ES5 properties
 * @returns {object} ES9 compatible properties
 */
function convertProperties(properties) {
  const converted = {};

  for (const [fieldName, fieldConfig] of Object.entries(properties)) {
    converted[fieldName] = convertFieldMapping(fieldConfig);
  }

  return converted;
}

/**
 * Convert individual field mapping
 * @param {object} fieldConfig - ES5 field configuration
 * @returns {object} ES9 compatible field configuration
 */
function convertFieldMapping(fieldConfig) {
  const converted = { ...fieldConfig };

  // Convert 'string' type to 'text' or 'keyword'
  if (fieldConfig.type === 'string') {
    // If field is not analyzed or uses keyword analyzer, convert to keyword
    if (fieldConfig.index === 'not_analyzed' || 
        fieldConfig.index === false ||
        fieldConfig.analyzer === 'keyword') {
      converted.type = 'keyword';
      logger.debug('Converted string field to keyword');
    } else {
      // Otherwise convert to text
      converted.type = 'text';
      logger.debug('Converted string field to text');
      
      // Add keyword subfield for aggregations/sorting
      if (!converted.fields) {
        converted.fields = {};
      }
      if (!converted.fields.keyword) {
        converted.fields.keyword = {
          type: 'keyword',
          ignore_above: 256
        };
      }
    }
    
    // Remove deprecated 'index' property if it's a boolean or 'not_analyzed'
    if (typeof converted.index === 'boolean' || converted.index === 'not_analyzed' || converted.index === 'analyzed') {
      delete converted.index;
    }
  }

  // Convert boolean 'index' to proper format
  if (typeof converted.index === 'string') {
    if (converted.index === 'no' || converted.index === 'not_analyzed') {
      converted.index = false;
    } else if (converted.index === 'analyzed') {
      converted.index = true;
    }
  }

  // Remove 'include_in_all' (deprecated in ES6+)
  if (converted.include_in_all !== undefined) {
    delete converted.include_in_all;
    logger.debug('Removed deprecated include_in_all property');
  }

  // Handle nested properties
  if (converted.properties) {
    converted.properties = convertProperties(converted.properties);
  }

  // Handle multi-fields
  if (converted.fields) {
    converted.fields = convertProperties(converted.fields);
  }

  // Convert deprecated 'index_name' to field name
  if (converted.index_name) {
    delete converted.index_name;
    logger.debug('Removed deprecated index_name property');
  }

  // Update date format if needed
  if (converted.type === 'date' && converted.format) {
    converted.format = updateDateFormat(converted.format);
  }

  // Handle geo_point type updates
  if (converted.type === 'geo_point') {
    // Remove deprecated lat_lon option
    if (converted.lat_lon !== undefined) {
      delete converted.lat_lon;
    }
    if (converted.geohash !== undefined) {
      delete converted.geohash;
    }
  }

  return converted;
}

/**
 * Update date format to ES9 compatible format
 * @param {string} format - ES5 date format
 * @returns {string} ES9 compatible date format
 */
function updateDateFormat(format) {
  // Most date formats are compatible, but some need updates
  let updated = format;
  
  // Replace deprecated format patterns
  updated = updated.replace(/YYYY/g, 'yyyy');
  updated = updated.replace(/DD/g, 'dd');
  
  return updated;
}

/**
 * Convert dynamic templates
 * @param {Array} templates - ES5 dynamic templates
 * @returns {Array} ES9 compatible dynamic templates
 */
function convertDynamicTemplates(templates) {
  return templates.map(template => {
    const converted = {};
    
    for (const [name, config] of Object.entries(template)) {
      converted[name] = {
        ...config,
        mapping: convertFieldMapping(config.mapping || {})
      };
    }
    
    return converted;
  });
}

/**
 * Validate converted mapping
 * @param {object} mapping - Converted mapping
 * @returns {object} Validation result
 */
export function validateMapping(mapping) {
  const issues = [];
  
  if (!mapping.properties || Object.keys(mapping.properties).length === 0) {
    issues.push('Mapping has no properties defined');
  }

  // Check for deprecated fields
  if (mapping._all !== undefined) {
    issues.push('_all field is deprecated in ES9');
  }

  if (mapping._timestamp !== undefined) {
    issues.push('_timestamp field is deprecated in ES9');
  }

  if (mapping._ttl !== undefined) {
    issues.push('_ttl field is deprecated in ES9');
  }

  const valid = issues.length === 0;
  
  if (valid) {
    logger.info('Mapping validation passed');
  } else {
    logger.warn('Mapping validation found issues', { issues });
  }

  return {
    valid,
    issues
  };
}

/**
 * Extract all field paths from mapping
 * @param {object} mapping - Mapping object
 * @param {string} prefix - Field prefix for nested fields
 * @returns {Array<string>} List of field paths
 */
export function extractFieldPaths(mapping, prefix = '') {
  const paths = [];
  
  if (!mapping || !mapping.properties) {
    return paths;
  }

  for (const [fieldName, fieldConfig] of Object.entries(mapping.properties)) {
    const fullPath = prefix ? `${prefix}.${fieldName}` : fieldName;
    paths.push(fullPath);

    // Recursively extract nested fields
    if (fieldConfig.properties) {
      const nestedPaths = extractFieldPaths({ properties: fieldConfig.properties }, fullPath);
      paths.push(...nestedPaths);
    }
  }

  return paths;
}

export default {
  convertMapping,
  validateMapping,
  extractFieldPaths
};
