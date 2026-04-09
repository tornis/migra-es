import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AnalyzerConverter');

/**
 * Convert Elasticsearch 5 settings (including analyzers) to ES9 format
 * @param {object} es5Settings - ES5 settings object
 * @returns {object} ES9 compatible settings
 */
export function convertSettings(es5Settings) {
  logger.info('Converting ES5 settings to ES9 format');

  if (!es5Settings || typeof es5Settings !== 'object') {
    logger.warn('Invalid settings provided, returning default settings');
    return { index: {} };
  }

  const es9Settings = {
    index: {}
  };

  // Extract index settings (remove the 'index.' prefix if present)
  const indexSettings = es5Settings.index || es5Settings;

  // Copy basic settings
  if (indexSettings.number_of_shards !== undefined) {
    es9Settings.index.number_of_shards = indexSettings.number_of_shards;
  }

  if (indexSettings.number_of_replicas !== undefined) {
    es9Settings.index.number_of_replicas = indexSettings.number_of_replicas;
  }

  if (indexSettings.refresh_interval !== undefined) {
    es9Settings.index.refresh_interval = indexSettings.refresh_interval;
  }

  // Convert analysis settings
  if (indexSettings.analysis) {
    es9Settings.index.analysis = convertAnalysis(indexSettings.analysis);
  }

  // Handle similarity settings
  if (indexSettings.similarity) {
    es9Settings.index.similarity = { ...indexSettings.similarity };
  }

  // Remove deprecated settings
  const deprecatedSettings = [
    'max_result_window',
    'codec',
    'compound_format',
    'compound_on_flush'
  ];

  for (const deprecated of deprecatedSettings) {
    if (indexSettings[deprecated] !== undefined) {
      logger.debug(`Removed deprecated setting: ${deprecated}`);
    }
  }

  logger.info('Settings conversion completed');
  return es9Settings;
}

/**
 * Convert analysis configuration
 * @param {object} analysis - ES5 analysis configuration
 * @returns {object} ES9 compatible analysis configuration
 */
function convertAnalysis(analysis) {
  const converted = {};

  // Convert analyzers
  if (analysis.analyzer) {
    converted.analyzer = convertAnalyzers(analysis.analyzer);
  }

  // Convert tokenizers
  if (analysis.tokenizer) {
    converted.tokenizer = convertTokenizers(analysis.tokenizer);
  }

  // Convert token filters
  if (analysis.filter) {
    converted.filter = convertTokenFilters(analysis.filter);
  }

  // Convert char filters
  if (analysis.char_filter) {
    converted.char_filter = convertCharFilters(analysis.char_filter);
  }

  // Convert normalizers (usually compatible)
  if (analysis.normalizer) {
    converted.normalizer = { ...analysis.normalizer };
  }

  return converted;
}

/**
 * Convert analyzers
 * @param {object} analyzers - ES5 analyzers
 * @returns {object} ES9 compatible analyzers
 */
function convertAnalyzers(analyzers) {
  const converted = {};

  for (const [name, config] of Object.entries(analyzers)) {
    converted[name] = { ...config };

    // Update deprecated analyzer types
    if (config.type === 'snowball') {
      logger.warn(`Analyzer '${name}' uses deprecated 'snowball' type, converting to 'custom' with stemmer filter`);
      converted[name] = {
        type: 'custom',
        tokenizer: config.tokenizer || 'standard',
        filter: ['lowercase', 'snowball']
      };
    }

    // Ensure filter array exists and convert deprecated filters
    if (converted[name].filter && Array.isArray(converted[name].filter)) {
      converted[name].filter = converted[name].filter.map(filter => 
        convertDeprecatedFilterName(filter)
      );
    }
  }

  return converted;
}

/**
 * Convert tokenizers
 * @param {object} tokenizers - ES5 tokenizers
 * @returns {object} ES9 compatible tokenizers
 */
function convertTokenizers(tokenizers) {
  const converted = {};

  for (const [name, config] of Object.entries(tokenizers)) {
    converted[name] = { ...config };

    // Update pattern tokenizer if needed
    if (config.type === 'pattern' && config.pattern) {
      // Most patterns are compatible, but log for review
      logger.debug(`Pattern tokenizer '${name}' - verify regex compatibility`);
    }
  }

  return converted;
}

/**
 * Convert token filters
 * @param {object} filters - ES5 token filters
 * @returns {object} ES9 compatible token filters
 */
function convertTokenFilters(filters) {
  const converted = {};

  for (const [name, config] of Object.entries(filters)) {
    converted[name] = { ...config };

    // Convert deprecated filter types
    if (config.type === 'standard') {
      logger.warn(`Filter '${name}' uses deprecated 'standard' type, removing`);
      continue; // Skip this filter
    }

    // Update delimited_payload_filter to delimited_payload
    if (config.type === 'delimited_payload_filter') {
      converted[name].type = 'delimited_payload';
      logger.debug(`Converted delimited_payload_filter to delimited_payload for '${name}'`);
    }

    // Update nGram to ngram
    if (config.type === 'nGram') {
      converted[name].type = 'ngram';
      logger.debug(`Converted nGram to ngram for '${name}'`);
    }

    // Update edgeNGram to edge_ngram
    if (config.type === 'edgeNGram') {
      converted[name].type = 'edge_ngram';
      logger.debug(`Converted edgeNGram to edge_ngram for '${name}'`);
    }

    // Update word_delimiter to word_delimiter_graph
    if (config.type === 'word_delimiter') {
      logger.info(`Filter '${name}' uses 'word_delimiter', consider using 'word_delimiter_graph'`);
      // Keep as is, but log recommendation
    }
  }

  return converted;
}

/**
 * Convert char filters
 * @param {object} charFilters - ES5 char filters
 * @returns {object} ES9 compatible char filters
 */
function convertCharFilters(charFilters) {
  const converted = {};

  for (const [name, config] of Object.entries(charFilters)) {
    converted[name] = { ...config };

    // Most char filters are compatible
    // Just ensure proper structure
    if (config.type === 'pattern_replace' && config.pattern) {
      logger.debug(`Pattern char filter '${name}' - verify regex compatibility`);
    }
  }

  return converted;
}

/**
 * Convert deprecated filter names
 * @param {string} filterName - Filter name
 * @returns {string} Updated filter name
 */
function convertDeprecatedFilterName(filterName) {
  const mapping = {
    'nGram': 'ngram',
    'edgeNGram': 'edge_ngram',
    'delimited_payload_filter': 'delimited_payload'
  };

  if (mapping[filterName]) {
    logger.debug(`Converted filter name: ${filterName} -> ${mapping[filterName]}`);
    return mapping[filterName];
  }

  return filterName;
}

/**
 * Validate converted settings
 * @param {object} settings - Converted settings
 * @returns {object} Validation result
 */
export function validateSettings(settings) {
  const issues = [];
  const warnings = [];

  // Check for required settings
  if (!settings.index) {
    issues.push('Missing index settings');
  }

  // Check analysis configuration
  if (settings.index?.analysis) {
    const analysis = settings.index.analysis;

    // Validate analyzers
    if (analysis.analyzer) {
      for (const [name, config] of Object.entries(analysis.analyzer)) {
        if (config.type === 'snowball') {
          warnings.push(`Analyzer '${name}' uses deprecated snowball type`);
        }
        
        if (config.type === 'custom' && !config.tokenizer) {
          issues.push(`Custom analyzer '${name}' missing tokenizer`);
        }
      }
    }

    // Validate filters
    if (analysis.filter) {
      for (const [name, config] of Object.entries(analysis.filter)) {
        if (config.type === 'standard') {
          warnings.push(`Filter '${name}' uses deprecated standard type`);
        }
      }
    }
  }

  const valid = issues.length === 0;

  if (valid && warnings.length === 0) {
    logger.info('Settings validation passed');
  } else if (valid) {
    logger.warn('Settings validation passed with warnings', { warnings });
  } else {
    logger.error('Settings validation failed', { issues, warnings });
  }

  return {
    valid,
    issues,
    warnings
  };
}

/**
 * Get list of all analyzers from settings
 * @param {object} settings - Settings object
 * @returns {Array<string>} List of analyzer names
 */
export function extractAnalyzers(settings) {
  const analyzers = [];

  if (settings?.index?.analysis?.analyzer) {
    analyzers.push(...Object.keys(settings.index.analysis.analyzer));
  }

  return analyzers;
}

export default {
  convertSettings,
  validateSettings,
  extractAnalyzers
};
