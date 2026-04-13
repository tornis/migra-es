import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import {
  getMemorySummary,
  deletePair,
} from '../../core/ai/breakingChangesMemory.js';
import config from '../../utils/config.js';
import path from 'path';
import { t } from '../../i18n/index.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const red    = gradient(['#ea4335', '#c5221f']);

function fmtDate(iso) {
  if (!iso) return '—';
  const d   = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PROVIDER_LABELS = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  custom: 'Custom',
};

export default function BreakingChangesMemoryView({ onBack }) {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows    ?? 24;

  const [entries,  setEntries]  = useState(() => getMemorySummary());
  const [cursor,   setCursor]   = useState(0);
  const [confirm,  setConfirm]  = useState(false);
  const [deleted,  setDeleted]  = useState(null);

  const memoryPath = path.join(config.app.dir, 'breaking-changes.json');

  const refresh = () => setEntries(getMemorySummary());

  const handleDelete = () => {
    const entry = entries[cursor];
    if (!entry) return;
    deletePair(entry.pair);
    refresh();
    setDeleted(entry.pair);
    setConfirm(false);
    setCursor(c => Math.min(c, Math.max(0, entries.length - 2)));
    setTimeout(() => setDeleted(null), 3000);
  };

  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') {
      if (confirm) { setConfirm(false); return; }
      onBack();
      return;
    }
    if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(entries.length - 1, c + 1));

    if ((input === 'd' || input === 'D') && entries.length > 0 && !confirm) {
      setConfirm(true);
    }
    if (key.return && confirm) {
      handleDelete();
    }
  });

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader />

      <Box paddingX={2} gap={1}>
        <Text bold color="yellow">{t('ai.memory_title')}</Text>
      </Box>
      <Box paddingX={2}>
        <Text dimColor>{t('ai.memory_path')} </Text>
        <Text dimColor color="yellow">{memoryPath}</Text>
      </Box>

      <Text color="yellow" dimColor paddingX={2}>{'─'.repeat(width - 4)}</Text>

      <Box flexDirection="column" paddingX={2} flexGrow={1}>

        {entries.length === 0 && (
          <Box flexDirection="column" paddingY={2}>
            <Text dimColor>{t('ai.memory_empty')}</Text>
            <Text dimColor>{t('ai.memory_empty_hint')}</Text>
          </Box>
        )}

        {entries.length > 0 && (
          <>
            {/* Header */}
            <Box gap={2} marginBottom={1}>
              <Text dimColor bold>{t('ai.memory_col_pair').padEnd(8)}</Text>
              <Text dimColor bold>{t('ai.memory_col_changes').padEnd(10)}</Text>
              <Text dimColor bold>{t('ai.memory_col_provider').padEnd(12)}</Text>
              <Text dimColor bold>{t('ai.memory_col_model').padEnd(24)}</Text>
              <Text dimColor bold>{t('ai.memory_col_date')}</Text>
            </Box>

            {entries.map((entry, i) => {
              const focused = i === cursor;
              return (
                <Box key={entry.pair} gap={2}>
                  {focused ? <Text color="yellow" bold>▶ </Text> : <Text>  </Text>}
                  <Text bold={focused} color={focused ? 'white' : undefined}>
                    {entry.pair.padEnd(6)}
                  </Text>
                  <Text dimColor={!focused}>
                    {'  '}{String(entry.count).padEnd(8)} {t('ai.memory_changes_suffix')}
                  </Text>
                  <Text dimColor={!focused}>
                    {'  '}{(PROVIDER_LABELS[entry.provider] ?? entry.provider).padEnd(10)}
                  </Text>
                  <Text dimColor={!focused}>
                    {'  '}{(entry.model ?? '').slice(0, 22).padEnd(24)}
                  </Text>
                  <Text dimColor={!focused}>
                    {'  '}{fmtDate(entry.generatedAt)}
                  </Text>
                </Box>
              );
            })}
          </>
        )}

        {/* Confirm delete dialog */}
        {confirm && entries[cursor] && (
          <Box flexDirection="column" marginTop={2} borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
            <Text bold color="red">{t('ai.memory_delete_confirm', { pair: entries[cursor].pair })}</Text>
            <Text dimColor>{t('ai.memory_delete_hint')}</Text>
          </Box>
        )}

        {/* Deleted notification */}
        {deleted && (
          <Box marginTop={1}>
            <Text color="green">{t('ai.memory_deleted', { pair: deleted })}</Text>
          </Box>
        )}
      </Box>

      {/* Command bar */}
      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2} gap={2}>
          {entries.length > 0 && (
            <Text>{yellow('↑↓')}<Text dimColor>{t('keys.navigate')}</Text></Text>
          )}
          {entries.length > 0 && !confirm && (
            <Text>{red('D')}<Text dimColor> {t('ai.memory_key_delete')}</Text></Text>
          )}
          {confirm && (
            <Text>{yellow('Enter')}<Text dimColor> {t('ai.memory_key_confirm_delete')}</Text></Text>
          )}
          <Text>{yellow('Q')}<Text dimColor>{t('keys.back')}</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
