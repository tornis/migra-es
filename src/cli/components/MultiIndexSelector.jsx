import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import GeminiSpinner from './GeminiSpinner.jsx';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const green  = gradient(['#34a853', '#0f9d58']);
const amber  = gradient(['#B8860B', '#DAA520']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scrollWindow(list, cursor, visibleRows) {
  const half   = Math.floor(visibleRows / 2);
  const offset = Math.max(0, Math.min(cursor - half, list.length - visibleRows));
  return { offset, visible: list.slice(offset, offset + visibleRows) };
}

// ─── Column sub-components ───────────────────────────────────────────────────

function Col1({ indices, cursor, focus, searchMode, query, visibleRows, queue }) {
  const { offset, visible } = scrollWindow(indices, cursor, visibleRows);

  const inQueue = useMemo(
    () => new Set(queue.map(q => q.indexName)),
    [queue]
  );

  return (
    <Box flexDirection="column">
      <Text color="yellow" bold>
        Índices
        <Text dimColor> ({indices.length})</Text>
      </Text>
      <Text color="yellow" dimColor>{'─'.repeat(30)}</Text>

      {searchMode ? (
        <Box marginBottom={1}>
          <Text>{yellow('/')}</Text>
          <Text color="white">{query}</Text>
          <Text color="yellow">_</Text>
        </Box>
      ) : (
        <Box marginBottom={1}>
          <Text dimColor>{yellow('/')} para buscar</Text>
        </Box>
      )}

      {indices.length === 0 ? (
        <Text dimColor>Nenhum índice encontrado</Text>
      ) : (
        visible.map((name, vi) => {
          const globalIdx   = offset + vi;
          const highlighted = globalIdx === cursor && focus === 'col1';
          const queued      = inQueue.has(name);
          return (
            <Box key={name}>
              {highlighted
                ? <Text color="yellow" bold>▶ </Text>
                : <Text>  </Text>
              }
              <Text
                color={highlighted ? 'white' : undefined}
                bold={highlighted}
                dimColor={!highlighted && !queued}
              >
                {name.length > 25 ? name.slice(0, 22) + '…' : name}
              </Text>
              {queued && <Text color="green"> ✓</Text>}
            </Box>
          );
        })
      )}

      {indices.length > visibleRows && (
        <Text dimColor>
          {offset + 1}–{Math.min(offset + visibleRows, indices.length)} / {indices.length}
        </Text>
      )}
    </Box>
  );
}

function Col2({ indexName, fields, fieldsLoading, cursor, focus }) {
  if (!indexName) {
    return (
      <Box flexDirection="column">
        <Text color="yellow" bold>Campo de Controle</Text>
        <Text color="yellow" dimColor>{'─'.repeat(30)}</Text>
        <Text dimColor>← Selecione um índice</Text>
      </Box>
    );
  }

  // Add "no control field" option at the end
  const items = [
    ...fields.map(f => ({ name: f.name, type: f.type, noControl: false })),
    { name: null, type: null, noControl: true },
  ];

  return (
    <Box flexDirection="column">
      <Text color="yellow" bold>
        Campo de Controle
      </Text>
      <Text color="yellow" dimColor>{'─'.repeat(30)}</Text>
      <Text dimColor>
        {indexName.length > 27 ? indexName.slice(0, 24) + '…' : indexName}
      </Text>

      {fieldsLoading ? (
        <Box marginTop={1}>
          <GeminiSpinner text="Carregando campos" />
        </Box>
      ) : items.length === 1 /* only no-control option */ ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" dimColor>⚠ Nenhum campo numérico/data</Text>
          <Text dimColor>Sem checkpoint disponível.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {items.map((item, i) => {
            const highlighted = i === cursor && focus === 'col2';
            if (item.noControl) {
              return (
                <Box key="__no_control__">
                  {highlighted
                    ? <Text color="yellow" bold>▶ </Text>
                    : <Text>  </Text>
                  }
                  <Text color="yellow" dimColor bold={highlighted}>
                    ⚠ Sem campo de controle
                  </Text>
                </Box>
              );
            }
            return (
              <Box key={item.name}>
                {highlighted
                  ? <Text color="yellow" bold>▶ </Text>
                  : <Text>  </Text>
                }
                <Text bold={highlighted} color={highlighted ? 'white' : undefined}>
                  {item.name.padEnd(20).slice(0, 20)}
                </Text>
                <Text dimColor> {item.type}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {!fieldsLoading && items.length > 1 && (
        <Box marginTop={1}>
          <Text dimColor>Enter para adicionar à fila</Text>
        </Box>
      )}
    </Box>
  );
}

function Col3({ queue, cursor, focus, width }) {
  return (
    <Box flexDirection="column">
      <Text color="yellow" bold>
        Fila de Migração
        {queue.length > 0 && <Text dimColor> ({queue.length})</Text>}
      </Text>
      <Text color="yellow" dimColor>{'─'.repeat(Math.min(30, width))}</Text>

      {queue.length === 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Vazio</Text>
          <Text dimColor>Selecione índice + campo</Text>
          <Text dimColor>e pressione Enter</Text>
        </Box>
      ) : (
        queue.map((item, i) => {
          const highlighted = i === cursor && focus === 'col3';
          return (
            <Box key={`${item.indexName}-${i}`} flexDirection="column" marginBottom={1}>
              <Box>
                {highlighted
                  ? <Text color="yellow" bold>▶ </Text>
                  : <Text>  </Text>
                }
                <Text bold={highlighted} color={highlighted ? 'white' : undefined}>
                  {item.indexName.length > 22
                    ? item.indexName.slice(0, 19) + '…'
                    : item.indexName}
                </Text>
              </Box>
              <Box marginLeft={4}>
                {item.controlField
                  ? <Text color="green">↳ {item.controlField}</Text>
                  : <Text color="yellow" dimColor>↳ sem controle ⚠</Text>
                }
                {highlighted && (
                  <Text dimColor> [D] remover</Text>
                )}
              </Box>
            </Box>
          );
        })
      )}

      {queue.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" dimColor>{'─'.repeat(Math.min(30, width))}</Text>
          <Text>
            {yellow('S')}<Text dimColor> iniciar {queue.length} migração{queue.length > 1 ? 'ões' : ''}</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * 3-column index + field + queue selector.
 *
 * @param {object}   props
 * @param {string[]} props.indices         - All available index names
 * @param {Function} props.onLoadFields    - async (indexName) => [{name, type}]
 * @param {Function} props.onConfirm       - called with [{indexName, controlField}]
 * @param {Function} props.onCancel
 */
export default function MultiIndexSelector({ indices, onLoadFields, onConfirm, onCancel }) {
  const { stdout } = useStdout();
  const totalWidth = stdout?.columns ?? 120;
  const totalRows  = stdout?.rows    ?? 24;

  // Column widths
  const DIVIDER_TOTAL = 4;  // 2 dividers × 2 chars each
  const PADX = 2;
  const available = totalWidth - DIVIDER_TOTAL - PADX * 2;
  const col1W = Math.floor(available * 0.30);
  const col2W = Math.floor(available * 0.32);
  const col3W = available - col1W - col2W;

  // Visible rows in col1 (subtract header rows + footer)
  const HEADER_ROWS = 10;
  const FOOTER_ROWS = 3;
  const visibleRows = Math.max(5, totalRows - HEADER_ROWS - FOOTER_ROWS);

  // ── State ──────────────────────────────────────────────────────────────────

  const [focus,       setFocus]       = useState('col1');
  const [cursor1,     setCursor1]     = useState(0);
  const [cursor2,     setCursor2]     = useState(0);
  const [cursor3,     setCursor3]     = useState(0);
  const [query,       setQuery]       = useState('');
  const [searchMode,  setSearchMode]  = useState(false);
  const [fields,      setFields]      = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [queue,       setQueue]       = useState([]);

  const fieldsCache = useRef({});

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredIndices = useMemo(
    () => query
      ? indices.filter(n => n.toLowerCase().includes(query.toLowerCase()))
      : indices,
    [indices, query]
  );

  const currentIndexName = filteredIndices[cursor1] ?? null;

  // col2 items = fields + no-control option
  const col2Items = useMemo(() => [
    ...fields.map(f => ({ name: f.name, type: f.type, noControl: false })),
    { name: null, type: null, noControl: true },
  ], [fields]);

  // ── Field loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentIndexName) { setFields([]); return; }

    const cached = fieldsCache.current[currentIndexName];
    if (cached) {
      setFields(cached);
      setFieldsLoading(false);
      return;
    }

    setFields([]);
    setFieldsLoading(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const loaded = await onLoadFields(currentIndexName);
        if (!cancelled) {
          fieldsCache.current[currentIndexName] = loaded;
          setFields(loaded);
          setCursor2(0);
        }
      } catch {
        if (!cancelled) setFields([]);
      } finally {
        if (!cancelled) setFieldsLoading(false);
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [currentIndexName]); // eslint-disable-line

  // ── Queue helpers ──────────────────────────────────────────────────────────

  const addToQueue = (indexName, controlField) => {
    setQueue(prev => {
      const idx = prev.findIndex(q => q.indexName === indexName);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { indexName, controlField };
        return next;
      }
      return [...prev, { indexName, controlField }];
    });
  };

  const removeFromQueue = (idx) => {
    setQueue(prev => prev.filter((_, i) => i !== idx));
    setCursor3(c => Math.max(0, c - (c > 0 ? 1 : 0)));
  };

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useInput((input, key) => {
    // ── Search mode ─────────────────────────────────────────────────────────
    if (searchMode) {
      if (key.escape) { setSearchMode(false); setQuery(''); setCursor1(0); return; }
      if (key.return) { setSearchMode(false); setCursor1(0); return; }
      if (key.backspace || key.delete) { setQuery(q => q.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) { setQuery(q => q + input); return; }
      return;
    }

    // ── Global: start migration ──────────────────────────────────────────
    if ((input === 's' || input === 'S') && queue.length > 0) {
      onConfirm(queue);
      return;
    }

    // ── Column 1 ────────────────────────────────────────────────────────────
    if (focus === 'col1') {
      if (key.upArrow) {
        setCursor1(c => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow) {
        setCursor1(c => Math.min(filteredIndices.length - 1, c + 1));
        return;
      }
      if (input === '/') { setSearchMode(true); return; }
      if (key.rightArrow || key.return || key.tab) {
        setFocus('col2');
        setCursor2(0);
        return;
      }
      if (key.escape || input === 'q' || input === 'Q') {
        onCancel();
        return;
      }
    }

    // ── Column 2 ────────────────────────────────────────────────────────────
    if (focus === 'col2') {
      if (key.upArrow) {
        setCursor2(c => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow) {
        setCursor2(c => Math.min(col2Items.length - 1, c + 1));
        return;
      }
      if (key.return) {
        if (currentIndexName && !fieldsLoading) {
          const selected = col2Items[cursor2];
          addToQueue(currentIndexName, selected?.noControl ? null : selected?.name ?? null);
          // Advance to next index automatically
          setCursor1(c => Math.min(filteredIndices.length - 1, c + 1));
          setFocus('col1');
        }
        return;
      }
      if (key.leftArrow || key.escape) { setFocus('col1'); return; }
      if (key.tab) { setFocus('col3'); return; }
    }

    // ── Column 3 ────────────────────────────────────────────────────────────
    if (focus === 'col3') {
      if (key.upArrow) {
        setCursor3(c => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow) {
        setCursor3(c => Math.min(queue.length - 1, c + 1));
        return;
      }
      if (input === 'd' || input === 'D' || key.delete || key.backspace) {
        removeFromQueue(cursor3);
        return;
      }
      if (key.leftArrow || key.escape || key.tab) { setFocus('col1'); return; }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" minHeight={totalRows}>
      <AppHeader subtitle="Seleção de Índices para Migração" />

      {/* Three columns */}
      <Box flexDirection="row" paddingX={PADX} flexGrow={1}>

        {/* Col 1 — Index list */}
        <Box flexDirection="column" width={col1W}>
          <Col1
            indices={filteredIndices}
            cursor={cursor1}
            focus={focus}
            searchMode={searchMode}
            query={query}
            visibleRows={visibleRows}
            queue={queue}
          />
        </Box>

        {/* Divider 1 */}
        <Box flexDirection="column" marginX={1}>
          {Array.from({ length: visibleRows + 4 }).map((_, i) => (
            <Text key={i} color="yellow" dimColor>│</Text>
          ))}
        </Box>

        {/* Col 2 — Field selector */}
        <Box flexDirection="column" width={col2W}>
          <Col2
            indexName={currentIndexName}
            fields={fields}
            fieldsLoading={fieldsLoading}
            cursor={cursor2}
            focus={focus}
          />
        </Box>

        {/* Divider 2 */}
        <Box flexDirection="column" marginX={1}>
          {Array.from({ length: visibleRows + 4 }).map((_, i) => (
            <Text key={i} color="yellow" dimColor>│</Text>
          ))}
        </Box>

        {/* Col 3 — Migration queue */}
        <Box flexDirection="column" width={col3W}>
          <Col3
            queue={queue}
            cursor={cursor3}
            focus={focus}
            width={col3W}
          />
        </Box>
      </Box>

      {/* Command bar */}
      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(totalWidth)}</Text>
        <Box paddingX={2} gap={2}>
          {focus === 'col1' && (
            <>
              <Text>{yellow('↑↓')}<Text dimColor> navegar</Text></Text>
              <Text>{yellow('→/Enter')}<Text dimColor> campos</Text></Text>
              <Text>{yellow('/')}<Text dimColor> buscar</Text></Text>
              {queue.length > 0 && <Text>{yellow('S')}<Text dimColor> iniciar</Text></Text>}
              <Text>{yellow('Esc')}<Text dimColor> cancelar</Text></Text>
            </>
          )}
          {focus === 'col2' && (
            <>
              <Text>{yellow('↑↓')}<Text dimColor> navegar</Text></Text>
              <Text>{yellow('Enter')}<Text dimColor> adicionar à fila</Text></Text>
              <Text>{yellow('←/Esc')}<Text dimColor> voltar</Text></Text>
              <Text>{yellow('Tab')}<Text dimColor> fila</Text></Text>
            </>
          )}
          {focus === 'col3' && (
            <>
              <Text>{yellow('↑↓')}<Text dimColor> navegar</Text></Text>
              <Text>{yellow('D')}<Text dimColor> remover</Text></Text>
              {queue.length > 0 && <Text>{yellow('S')}<Text dimColor> iniciar</Text></Text>}
              <Text>{yellow('Tab/Esc')}<Text dimColor> voltar</Text></Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
