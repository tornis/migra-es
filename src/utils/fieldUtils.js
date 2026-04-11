const SORTABLE_TYPES = [
  'long', 'integer', 'short', 'byte',
  'double', 'float', 'half_float', 'scaled_float',
  'date', 'date_nanos',
  'keyword',
];

function extractFields(properties, prefix = '') {
  const fields = [];
  for (const [name, cfg] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (SORTABLE_TYPES.includes(cfg.type)) {
      fields.push({ name: path, type: cfg.type });
    }
    if (cfg.properties) fields.push(...extractFields(cfg.properties, path));
    if (cfg.fields)     fields.push(...extractFields(cfg.fields, path));
  }
  return fields;
}

/**
 * Extract sortable/numeric/date fields from an ES mapping object.
 * Handles both flat mappings and type-wrapped mappings (ES5 style).
 *
 * @param {object} mapping - Raw mapping object from getIndexMapping()
 * @returns {Array<{name: string, type: string}>}
 */
export function extractSortableFields(mapping) {
  if (!mapping) return [];

  // Flat: { properties: { ... } }
  if (mapping.properties) return extractFields(mapping.properties);

  // Type-wrapped: { myType: { properties: { ... } } }
  for (const v of Object.values(mapping)) {
    if (v?.properties) return extractFields(v.properties);
  }

  return [];
}
