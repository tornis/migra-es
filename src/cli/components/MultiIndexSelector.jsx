import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import GeminiSpinner from './GeminiSpinner.jsx';
import { t, tp } from '../../i18n/index.js';

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
        {t('indices.title')}
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
          <Text dimColor>{yellow('/')}{t('indices.search_hint')}</Text>
        </Box>
      )}

      {indices.length === 0 ? (
        <Text dimColor>{t('indices.no_results')}</Text>
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
        <Text color="yellow" bold>{t('indices.field_title')}</Text>
        <Text color="yellow" dimColor>{'─'.repeat(30)}</Text>
        <Text dimColor>{t('indices.field_select_hint')}</Text>
      </Box>
    );
  }

  const items = [
    ...fields.map(f => ({ name: f.name, type: f.type, noControl: false })),
    { name: null, type: null, noControl: true },
  ];

  return (
    <Box flexDirection="column">
      <Text color="yellow" bold>{t('indices.field_title')}</Text>
      <Text color="yellow" dimColor>{'─'.repeat(30)}</Text>
      <Text dimColor>
        {indexName.length > 27 ? indexName.slice(0, 24) + '…' : indexName}
      </Text>

      {fieldsLoading ? (
        <Box marginTop={1}>
          <GeminiSpinner text={t('indices.field_loading')} />
        </Box>
      ) : items.length === 1 /* only no-control option */ ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" dimColor>{t('indices.field_no_numeric')}</Text>
          <Text dimColor>{t('indices.field_no_checkpoint')}</Text>
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
                    {t('indices.field_no_control')}
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
          <Text dimColor>{t('indices.field_add_hint')}</Text>
        </Box>
      )}
    </Box>
  );
}

function Col3({ queue, cursor, focus, width }) {
  return (
    <Box flexDirection="column">
      <Text color="yellow" bold>
        {t('indices.queue_title')}
        {queue.length > 0 && <Text dimColor> ({queue.length})</Text>}
      </Text>
      <Text color="yellow" dimColor>{'─'.repeat(Math.min(30, width))}</Text>

      {queue.length === 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{t('indices.queue_empty')}</Text>
          <Text dimColor>{t('indices.queue_empty_hint1')}</Text>
          <Text dimColor>{t('indices.queue_empty_hint2')}</Text>
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
                  : <Text color="yellow" dimColor>{t('indices.queue_no_control')}</Text>
                }
                {highlighted && (
                  <Text dimColor>{t('indices.queue_remove_hint')}</Text>
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
            {yellow('S')}<Text dimColor>{tp('indices.queue_start', queue.length, { count: queue.length })}</Text>
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
  const DIVIDER_TOTAL = 4;
  const PADX = 2;
  const available = totalWidth - DIVIDER_TOTAL - PADX * 2;
  const col1W = Math.floor(available * 0.30);
  const col2W = Math.floor(available * 0.32);
  const col3W = available - col1W - col2W;

  const HEADER_ROWS = 10;
  const FOOTER_ROWS = 3;
  const visibleRows = Math.max(5, totalRows - HEADER_ROWS - FOOTER_ROWS);

  // ── State ─────────────────────────────────────────────────────────────────

  const [focus,         setFocus]         = useState('col1');
  const [cursor1,       setCursor1]       = useState(0);
  const [cursor2,       setCursor2]       = useState(0);
  const [cursor3,       setCursor3]       = useState(0);
  const [query,         setQuery]         = useState('');
  const [searchMode,    setSearchMode]    = useState(false);
  const [fields,        setFields]        = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [queue,         setQueue]         = useState([]);

  const fieldsCache = useRef({});

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredIndices = useMemo(
    () => query
      ? indices.filter(n => n.toLowerCase().includes(query.toLowerCase()))
      : indices,
    [indices, query]
  );

  const currentIndexName = filteredIndices[cursor1] ?? null;

  const col2Items = useMemo(() => [
    ...fields.map(f => ({ name: f.name, type: f.type, noControl: false })),
    { name: null, type: null, noControl: true },
  ], [fields]);

  // ── Field loading ─────────────────────────────────────────────────────────

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

  // ── Queue helpers ─────────────────────────────────────────────────────────

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

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useInput((input, key) => {
    // ── Search mode ──────────────────────────────────────────────────────
    if (searchMode) {
      if (key.escape) { setSearchMode(false); setQuery(''); setCursor1(0); return; }
      if (key.return) { setSearchMode(false); setCursor1(0); return; }
      if (key.backspace || key.delete) { setQuery(q => q.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) { setQuery(q => q + input); return; }
      return;
    }

    // ── Global: start migration ──────────────────────────────────────
    if ((input === 's' || input === 'S') && queue.length > 0) {
      onConfirm(queue);
      return;
    }

    // ── Column 1 ────────────────────────────────────────────────────────
    if (focus === 'col1') {
      if (key.upArrow) { setCursor1(c => Math.max(0, c - 1)); return; }
      if (key.downArrow) { setCursor1(c => Math.min(filteredIndices.length - 1, c + 1)); return; }
      if (input === '/') { setSearchMode(true); return; }
      if (key.rightArrow || key.return || key.tab) { setFocus('col2'); setCursor2(0); return; }
      if (key.escape || input === 'q' || input === 'Q') { onCancel(); return; }
    }

    // ── Column 2 ────────────────────────────────────────────────────────
    if (focus === 'col2') {
      if (key.upArrow) { setCursor2(c => Math.max(0, c - 1)); return; }
      if (key.downArrow) { setCursor2(c => Math.min(col2Items.length - 1, c + 1)); return; }
      if (key.return) {
        if (currentIndexName && !fieldsLoading) {
          const selected = col2Items[cursor2];
          addToQueue(currentIndexName, selected?.noControl ? null : selected?.name ?? null);
          setCursor1(c => Math.min(filteredIndices.length - 1, c + 1));
          setFocus('col1');
        }
        return;
      }
      if (key.leftArrow || key.escape) { setFocus('col1'); return; }
      if (key.tab) { setFocus('col3'); return; }
    }

    // ── Column 3 ────────────────────────────────────────────────────────
    if (focus === 'col3') {
      if (key.upArrow) { setCursor3(c => Math.max(0, c - 1)); return; }
      if (key.downArrow) { setCursor3(c => Math.min(queue.length - 1, c + 1)); return; }
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
      <AppHeader subtitle={t('wizard.indices_title')} />

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
              <Text>{yellow('↑↓')}<Text dimColor>{t('keys.navigate')}</Text></Text>
              <Text>{yellow('→/Enter')}<Text dimColor>{t('keys.fields')}</Text></Text>
              <Text>{yellow('/')}<Text dimColor>{t('keys.search')}</Text></Text>
              {queue.length > 0 && <Text>{yellow('S')}<Text dimColor>{t('keys.start')}</Text></Text>}
              <Text>{yellow('Esc')}<Text dimColor>{t('keys.back')}</Text></Text>
            </>
          )}
          {focus === 'col2' && (
            <>
              <Text>{yellow('↑↓')}<Text dimColor>{t('keys.navigate')}</Text></Text>
              <Text>{yellow('Enter')}<Text dimColor>{t('keys.add_to_queue')}</Text></Text>
              <Text>{yellow('←/Esc')}<Text dimColor>{t('keys.back')}</Text></Text>
              <Text>{yellow('Tab')}<Text dimColor>{t('keys.queue_tab')}</Text></Text>
            </>
          )}
          {focus === 'col3' && (
            <>
              <Text>{yellow('↑↓')}<Text dimColor>{t('keys.navigate')}</Text></Text>
              <Text>{yellow('D')}<Text dimColor>{t('keys.remove')}</Text></Text>
              {queue.length > 0 && <Text>{yellow('S')}<Text dimColor>{t('keys.start')}</Text></Text>}
              <Text>{yellow('Tab/Esc')}<Text dimColor>{t('keys.back')}</Text></Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
