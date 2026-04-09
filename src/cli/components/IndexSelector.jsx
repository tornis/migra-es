import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';

/**
 * Index selector component
 * @param {object} props - Component props
 * @param {Array} props.indices - List of indices
 * @param {boolean} props.loading - Loading state
 * @param {Function} props.onSelect - Selection callback
 * @param {Function} props.onCancel - Cancel callback
 */
export default function IndexSelector({ indices, loading, onSelect, onCancel }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (indices && indices.length > 0) {
      const indexItems = indices.map(index => ({
        label: `${index.name} (${index.docsCount} docs, ${index.storeSize})`,
        value: index.name,
        index
      }));
      setItems(indexItems);
    }
  }, [indices]);

  const handleSelect = (item) => {
    onSelect(item.index);
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          {' '}Carregando índices...
        </Text>
      </Box>
    );
  }

  if (!indices || indices.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Nenhum índice encontrado.</Text>
        <Text dimColor>Pressione ESC para voltar</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Selecione o índice para migrar:</Text>
      <Text> </Text>
      <SelectInput items={items} onSelect={handleSelect} />
      <Text> </Text>
      <Text dimColor>Use ↑↓ para navegar, Enter para selecionar, ESC para cancelar</Text>
    </Box>
  );
}
