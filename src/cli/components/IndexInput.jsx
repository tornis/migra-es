import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import gradient from 'gradient-string';
import GeminiBox from './GeminiBox.jsx';

/**
 * Index input component with autocomplete
 * Allows user to type index name with suggestions
 */
export default function IndexInput({ indices, onSubmit, onCancel }) {
  const [query, setQuery] = useState('');
  const geminiGradient = gradient(['#fbbc04', '#f4b400', '#ff9800', '#ffc107']);

  // Filter indices based on query
  const filteredIndices = query.length > 0
    ? indices.filter(index => 
        index.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10) // Show max 10 suggestions
    : [];

  const handleSubmit = (value) => {
    if (value.trim()) {
      // Check if index exists
      const exists = indices.includes(value.trim());
      if (exists) {
        onSubmit(value.trim());
      } else {
        // Allow typing non-existent index (user might know the name)
        onSubmit(value.trim());
      }
    }
  };

  return (
    <GeminiBox title="Digite o Nome do Índice" color="yellow">
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text>
            💡 Digite o nome do índice ou parte dele para filtrar
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text bold>{geminiGradient('Índice: ')}</Text>
          <TextInput
            value={query}
            onChange={setQuery}
            onSubmit={handleSubmit}
            placeholder="ex: products, logs-2024..."
          />
        </Box>

        {query.length > 0 && filteredIndices.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Sugestões ({filteredIndices.length}):</Text>
            {filteredIndices.map((index, i) => (
              <Box key={index} marginLeft={2}>
                <Text color="green">→ </Text>
                <Text>{index}</Text>
              </Box>
            ))}
            {indices.filter(idx => idx.toLowerCase().includes(query.toLowerCase())).length > 10 && (
              <Text dimColor marginLeft={2}>
                ... e mais {indices.filter(idx => idx.toLowerCase().includes(query.toLowerCase())).length - 10} índices
              </Text>
            )}
          </Box>
        )}

        {query.length > 0 && filteredIndices.length === 0 && (
          <Box marginTop={1}>
            <Text color="yellow">⚠️  Nenhum índice encontrado com "{query}"</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>
            {geminiGradient('Enter')} Confirmar  {geminiGradient('Esc')} Cancelar  {geminiGradient('Tab')} Ver lista completa
          </Text>
        </Box>
      </Box>
    </GeminiBox>
  );
}
