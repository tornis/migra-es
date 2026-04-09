import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';

/**
 * Field selector component for choosing control field
 * @param {object} props - Component props
 * @param {object} props.mapping - Index mapping
 * @param {Function} props.onSelect - Selection callback
 * @param {Function} props.onCancel - Cancel callback
 */
export default function FieldSelector({ mapping, onSelect, onCancel }) {
  const [items, setItems] = useState([]);
  const [hasFields, setHasFields] = useState(true);

  useEffect(() => {
    if (!mapping) {
      return;
    }
    
    // ES5/6 may have mapping wrapped in type name
    let properties = mapping.properties;
    
    // If no direct properties, check if wrapped in type (ES5 format)
    if (!properties && mapping) {
      const keys = Object.keys(mapping);
      
      // Try to find properties in nested structure
      for (const key of keys) {
        if (mapping[key] && mapping[key].properties) {
          properties = mapping[key].properties;
          break;
        }
      }
    }
    
    if (!properties) {
      setHasFields(false);
      setItems([
        { 
          label: '⚠️  Migrar SEM campo de controle (não recomendado)', 
          value: null,
          isNoControl: true
        }
      ]);
      return;
    }
    
    const fields = extractFields(properties);
    
    if (fields.length === 0) {
      setHasFields(false);
      setItems([
        { 
          label: '⚠️  Migrar SEM campo de controle (não recomendado)', 
          value: null,
          isNoControl: true
        }
      ]);
    } else {
      setHasFields(true);
      const fieldItems = fields.map(field => ({
        label: `${field.name} (${field.type})`,
        value: field.name,
        field,
        isNoControl: false
      }));
      
      // Add option to proceed without control field at the end
      fieldItems.push({
        label: '⚠️  Migrar SEM campo de controle (não recomendado)',
        value: null,
        isNoControl: true
      });
      
      setItems(fieldItems);
    }
  }, [mapping]);

  const handleSelect = (item) => {
    if (!item) {
      return;
    }
    
    if (item.isNoControl) {
      // User chose to migrate without control field
      onSelect(null);
    } else {
      onSelect(item.value);
    }
  };

  /**
   * Extract fields from mapping properties
   * @param {object} properties - Mapping properties
   * @param {string} prefix - Field prefix
   * @returns {Array} List of fields
   */
  function extractFields(properties, prefix = '') {
    const fields = [];
    
    for (const [fieldName, fieldConfig] of Object.entries(properties)) {
      const fullPath = prefix ? `${prefix}.${fieldName}` : fieldName;
      
      // Include all sortable numeric and date fields
      const numericTypes = ['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float'];
      const dateTypes = ['date', 'date_nanos'];
      const otherSortable = ['keyword'];
      
      const allSortableTypes = [...numericTypes, ...dateTypes, ...otherSortable];
      
      if (allSortableTypes.includes(fieldConfig.type)) {
        fields.push({
          name: fullPath,
          type: fieldConfig.type
        });
      }

      // Recursively extract nested fields
      if (fieldConfig.properties) {
        const nestedFields = extractFields(fieldConfig.properties, fullPath);
        fields.push(...nestedFields);
      }
      
      // Also check fields property (for multi-fields)
      if (fieldConfig.fields) {
        const multiFields = extractFields(fieldConfig.fields, fullPath);
        fields.push(...multiFields);
      }
    }

    return fields;
  }

  if (items.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">Carregando campos...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Selecione o campo de controle:</Text>
      <Text dimColor>Campo usado para rastrear o progresso da migração</Text>
      {!hasFields && (
        <>
          <Text> </Text>
          <Text color="yellow">⚠️  Nenhum campo numérico ou de data encontrado.</Text>
          <Text dimColor>Campos recomendados: long, integer, date, timestamp</Text>
        </>
      )}
      <Text> </Text>
      
      {hasFields && (
        <>
          <Text color="green">✓ Campos disponíveis para controle:</Text>
          <Text dimColor>  • Numéricos: long, integer, short, byte, double, float</Text>
          <Text dimColor>  • Data/Hora: date, date_nanos</Text>
          <Text> </Text>
        </>
      )}
      
      {items.length > 0 && <SelectInput items={items} onSelect={handleSelect} />}
      <Text> </Text>
      
      {hasFields ? (
        <Text dimColor>Use ↑↓ para navegar, Enter para selecionar, ESC para cancelar</Text>
      ) : (
        <>
          <Text color="yellow">ATENÇÃO: Migrar sem campo de controle significa:</Text>
          <Text dimColor>  • Não será possível pausar e retomar a migração</Text>
          <Text dimColor>  • Não haverá checkpoint em caso de falha</Text>
          <Text dimColor>  • A migração será feita em uma única execução</Text>
          <Text> </Text>
          <Text dimColor>Use ↑↓ para navegar, Enter para confirmar, ESC para cancelar</Text>
        </>
      )}
    </Box>
  );
}
