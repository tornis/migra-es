import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import gradient from 'gradient-string';
import GeminiBox from './GeminiBox.jsx';

/**
 * Index selector component with search and pagination
 * @param {object} props - Component props
 * @param {Array<string>} props.indices - List of indices
 * @param {Function} props.onSelect - Selection callback
 * @param {Function} props.onCancel - Cancel callback
 */
export default function IndexSelector({ indices, onSelect, onCancel }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState('browse'); // 'browse' or 'search'
  const geminiGradient = gradient(['#fbbc04', '#f4b400', '#ff9800', '#ffc107']);
  
  const PAGE_SIZE = 15;

  // Filter indices based on search
  const filteredIndices = searchQuery
    ? indices.filter(index => 
        index.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : indices;

  // Paginate
  const totalPages = Math.ceil(filteredIndices.length / PAGE_SIZE);
  const startIdx = page * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, filteredIndices.length);
  const paginatedIndices = filteredIndices.slice(startIdx, endIdx);

  const items = [
    // Add search option at top
    {
      label: geminiGradient('🔍 Buscar índice...'),
      value: '__search__'
    },
    // Add indices
    ...paginatedIndices.map(index => ({
      label: index,
      value: index
    })),
    // Add pagination controls
    ...(page > 0 ? [{
      label: geminiGradient('⬅️  Página anterior'),
      value: '__prev__'
    }] : []),
    ...(page < totalPages - 1 ? [{
      label: geminiGradient('➡️  Próxima página'),
      value: '__next__'
    }] : [])
  ];

  useInput((input, key) => {
    // Search mode
    if (mode === 'search') {
      if (key.escape) {
        setMode('browse');
        setSearchQuery('');
      } else if (key.backspace || key.delete) {
        setSearchQuery(prev => prev.slice(0, -1));
        setPage(0);
      } else if (input && !key.ctrl && !key.meta) {
        setSearchQuery(prev => prev + input);
        setPage(0);
      }
    }
  });

  const handleSelect = (item) => {
    if (item.value === '__search__') {
      setMode('search');
    } else if (item.value === '__prev__') {
      setPage(prev => Math.max(0, prev - 1));
    } else if (item.value === '__next__') {
      setPage(prev => Math.min(totalPages - 1, prev + 1));
    } else {
      onSelect(item.value);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <GeminiBox title="Selecione o Índice" color="yellow">
        <Box flexDirection="column">
          {indices.length === 0 ? (
            <Text color="yellow">⚠️  Nenhum índice encontrado no cluster de origem.</Text>
          ) : (
            <>
              <Box marginBottom={1}>
                <Text>
                  📊 Total: {geminiGradient(filteredIndices.length.toString())} índices
                  {searchQuery && ` (filtrado de ${indices.length})`}
                </Text>
              </Box>

              {mode === 'search' && (
                <Box marginBottom={1} flexDirection="column">
                  <Text bold>{geminiGradient('🔍 Buscar: ')}{searchQuery}_</Text>
                  <Text dimColor>Digite para filtrar, Esc para voltar</Text>
                </Box>
              )}

              {filteredIndices.length > 0 ? (
                <>
                  <Box marginBottom={1}>
                    <Text dimColor>
                      Página {page + 1} de {totalPages} 
                      {' '}({startIdx + 1}-{endIdx} de {filteredIndices.length})
                    </Text>
                  </Box>
                  
                  <SelectInput items={items} onSelect={handleSelect} />
                </>
              ) : (
                <Text color="yellow">
                  ⚠️  Nenhum índice encontrado com "{searchQuery}"
                </Text>
              )}
            </>
          )}
        </Box>
      </GeminiBox>

      <Box marginTop={1}>
        <Text dimColor>
          {geminiGradient('↑↓')} Navegar  
          {geminiGradient('Enter')} Selecionar  
          {geminiGradient('/')} Buscar  
          {geminiGradient('Esc')} Cancelar
        </Text>
      </Box>
    </Box>
  );
}
