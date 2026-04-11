import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const amber  = gradient(['#B8860B', '#DAA520']);

const PAGE_SIZE = 12;

export default function IndexSelector({ indices, onSelect, onCancel }) {
  const [query, setQuery]   = useState('');
  const [page, setPage]     = useState(0);
  const [search, setSearch] = useState(false);
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows ?? 24;

  const filtered = query
    ? indices.filter(i => i.toLowerCase().includes(query.toLowerCase()))
    : indices;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const slice      = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  useInput((input, key) => {
    if (!search) return;
    if (key.escape)           { setSearch(false); setQuery(''); return; }
    if (key.backspace || key.delete) { setQuery(q => q.slice(0, -1)); setPage(0); return; }
    if (input && !key.ctrl && !key.meta) { setQuery(q => q + input); setPage(0); }
  });

  const items = [
    { label: yellow('  Buscar índice...'), value: '__search__' },
    ...slice.map(i => ({ label: `  ${i}`, value: i })),
    ...(page > 0            ? [{ label: amber('  ← Página anterior'), value: '__prev__' }] : []),
    ...(page < totalPages-1 ? [{ label: amber('  → Próxima página'),  value: '__next__' }] : []),
  ];

  const handleSelect = (item) => {
    if      (item.value === '__search__') setSearch(true);
    else if (item.value === '__prev__')   setPage(p => p - 1);
    else if (item.value === '__next__')   setPage(p => p + 1);
    else                                  onSelect(item.value);
  };

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader subtitle="Selecionar Índice" />

      <Box flexDirection="column" paddingX={4} flexGrow={1}>
        <Box marginBottom={1} gap={4}>
          <Text>
            <Text dimColor>Índices: </Text>
            {yellow(String(filtered.length))}
            {query && <Text dimColor> de {indices.length}</Text>}
          </Text>
          <Text dimColor>
            Página {page + 1}/{totalPages || 1}
            {' '}({page * PAGE_SIZE + 1}–{Math.min((page+1) * PAGE_SIZE, filtered.length)})
          </Text>
        </Box>

        {search && (
          <Box marginBottom={1} flexDirection="column">
            <Text>{yellow('Buscar: ')}{query}<Text color="yellow">_</Text></Text>
            <Text dimColor>  Digite para filtrar  •  Esc para voltar</Text>
          </Box>
        )}

        {filtered.length === 0
          ? <Text color="yellow">Nenhum índice encontrado com "{query}"</Text>
          : <SelectInput items={items} onSelect={handleSelect} />
        }
      </Box>

      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2}>
          <Text>
            {yellow('↑↓')}<Text dimColor> navegar   </Text>
            {yellow('Enter')}<Text dimColor> selecionar   </Text>
            {yellow('/')}<Text dimColor> buscar   </Text>
            {yellow('Esc')}<Text dimColor> cancelar</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
