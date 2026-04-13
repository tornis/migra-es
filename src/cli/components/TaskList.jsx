import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import { t, tp, locale } from '../../i18n/index.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const green  = gradient(['#34a853', '#0f9d58']);
const red    = gradient(['#ea4335', '#c5221f']);
const amber  = gradient(['#B8860B', '#DAA520']);

const STATUS_ICON = {
  pending:   '○',
  running:   '▶',
  paused:    '⏸',
  completed: '✓',
  failed:    '✗',
  cancelled: '◼',
};

function statusColor(status) {
  switch (status) {
    case 'running':   return yellow;
    case 'completed': return green;
    case 'failed':    return red;
    case 'paused':
    case 'cancelled': return amber;
    default:          return (s) => s;
  }
}

function pct(task) {
  const total = task.progress?.total ?? 0;
  if (!total) return 0;
  const written = task.progress?.written ?? task.progress?.processed ?? 0;
  return Math.min(100, Math.floor((written / total) * 100));
}

function readPct(task) {
  const total = task.progress?.total ?? 0;
  if (!total) return 0;
  const enqueued = task.progress?.enqueued ?? 0;
  return Math.min(100, Math.floor((enqueued / total) * 100));
}

function fmt(n) {
  return (n ?? 0).toLocaleString(locale);
}

function fmtDate(iso) {
  if (!iso) return null;
  const d   = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, focused, barLen }) {
  const p        = pct(task);
  const rp       = readPct(task);
  const col      = statusColor(task.status);
  const icon     = STATUS_ICON[task.status] ?? '○';
  const isActive = ['running', 'paused'].includes(task.status);

  const writeBar = '█'.repeat(Math.round((p  / 100) * barLen)) + '░'.repeat(barLen - Math.round((p  / 100) * barLen));
  const readBar  = '█'.repeat(Math.round((rp / 100) * barLen)) + '░'.repeat(barLen - Math.round((rp / 100) * barLen));

  const written  = task.progress?.written  ?? task.progress?.processed ?? 0;
  const enqueued = task.progress?.enqueued ?? 0;
  const total    = task.progress?.total    ?? 0;
  const failed   = task.progress?.failed   ?? 0;

  const statusLabel = t(`status.${task.status}`) ?? task.status;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Index name + status */}
      <Box gap={1}>
        {focused ? <Text color="yellow" bold>▶ </Text> : <Text>  </Text>}
        <Text bold={focused} color={focused ? 'white' : undefined}>
          {icon} {task.indexName ?? task.name}
        </Text>
        <Text> </Text>
        <Text>{col(statusLabel)}</Text>
        {task.controlField && (
          <Text dimColor>  ↳ {task.controlField}</Text>
        )}
      </Box>

      {/* Dates */}
      <Box marginLeft={4} gap={3}>
        {fmtDate(task.createdAt) && (
          <Text dimColor>{t('dashboard.created')} {fmtDate(task.createdAt)}</Text>
        )}
        {fmtDate(task.completedAt) && (
          <Text dimColor>{t('dashboard.completed_at')} {fmtDate(task.completedAt)}</Text>
        )}
      </Box>

      {/* Progress bars (only when active with data) */}
      {isActive && total > 0 && (
        <Box flexDirection="column" marginLeft={4}>
          <Box gap={1}>
            <Text dimColor>{t('dashboard.write')}</Text>
            <Text>{yellow(writeBar)}</Text>
            <Text> {col(`${p}%`)}</Text>
            <Text dimColor>  {fmt(written)} / {fmt(total)} {t('dashboard.docs')}</Text>
            {failed > 0 && <Text color="red">  ✗ {fmt(failed)} {t('dashboard.failures')}</Text>}
          </Box>
          {enqueued > written + 1000 && (
            <Box gap={1}>
              <Text dimColor>{t('dashboard.read')}</Text>
              <Text>{amber(readBar)}</Text>
              <Text> {amber(`${rp}%`)}</Text>
              <Text dimColor>  {fmt(enqueued)} {t('dashboard.queued')}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Completed/failed summary */}
      {!isActive && total > 0 && (
        <Box marginLeft={4}>
          <Text dimColor>
            {fmt(written)} / {fmt(total)} {t('dashboard.docs')}
            {failed > 0 && `  ✗ ${fmt(failed)} ${t('dashboard.failures')}`}
          </Text>
        </Box>
      )}

      {/* Error message */}
      {task.error && (
        <Box marginLeft={4}>
          <Text color="red" dimColor>✗ {task.error}</Text>
        </Box>
      )}
    </Box>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {Array}    props.tasks       - All task objects (enriched with Redis counters)
 * @param {Function} props.onSelect    - Called with a task object to open monitor
 * @param {Function} props.onNew       - Called to start the migration wizard
 * @param {Function} props.onImpact    - Called with a task to run impact analysis
 * @param {Function} props.onAIConfig  - Called to open AI provider settings
 * @param {Function} props.onMemory    - Called to open breaking changes memory view
 */
export default function TaskList({ tasks, onSelect, onNew, onImpact, onAIConfig, onMemory }) {
  const { stdout } = useStdout();
  const totalWidth = stdout?.columns ?? 80;
  const rows       = stdout?.rows    ?? 24;

  const [cursor, setCursor] = useState(0);

  const active  = tasks.filter(t => ['running', 'paused', 'pending'].includes(t.status));
  const done    = tasks.filter(t => ['completed', 'failed', 'cancelled'].includes(t.status));
  const allRows = [...active, ...done];

  const BAR_LEN = Math.max(10, Math.min(30, totalWidth - 50));

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') return; // parent handles quit

    if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(allRows.length - 1, c + 1));

    if (key.return && allRows[cursor]) {
      onSelect(allRows[cursor]);
    }

    if (input === 'n' || input === 'N') {
      onNew();
    }

    // Quick controls for active task under cursor
    const focused = allRows[cursor];
    if (focused && (input === 'p' || input === 'P') && focused.status === 'running') {
      onSelect({ ...focused, _action: 'pause' });
    }
    if (focused && (input === 'r' || input === 'R') && focused.status === 'paused') {
      onSelect({ ...focused, _action: 'resume' });
    }
    if (focused && (input === 'c' || input === 'C') && ['running','paused'].includes(focused.status)) {
      onSelect({ ...focused, _action: 'cancel' });
    }
    if (focused && (input === 'e' || input === 'E') && ['completed','failed','cancelled'].includes(focused.status)) {
      onSelect({ ...focused, _action: 'reprocess' });
    }

    // Impact analysis for focused task
    if ((input === 'i' || input === 'I') && focused && onImpact) {
      onImpact(focused);
    }

    // AI provider settings
    if ((input === 'a' || input === 'A') && onAIConfig) {
      onAIConfig();
    }

    // Breaking changes memory
    if ((input === 'm' || input === 'M') && onMemory) {
      onMemory();
    }
  });

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader />

      <Box flexDirection="column" paddingX={2} flexGrow={1}>

        {/* New migration shortcut + active count */}
        <Box marginBottom={1}>
          <Text>
            {yellow('N')}<Text dimColor> {t('dashboard.new')}</Text>
          </Text>
          {active.length > 0 && (
            <Text>
              <Text dimColor>  •  </Text>
              <Text color="yellow">● {active.length}</Text>
              <Text dimColor> {tp('dashboard.active', active.length)}</Text>
            </Text>
          )}
        </Box>

        <Text color="yellow" dimColor>{'─'.repeat(totalWidth - 4)}</Text>

        {/* Active tasks */}
        {active.length > 0 && (
          <>
            <Box marginTop={1} marginBottom={1}>
              <Text color="yellow" bold>{t('dashboard.section_active')}</Text>
            </Box>
            {active.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                focused={allRows.indexOf(task) === cursor}
                barLen={BAR_LEN}
              />
            ))}
            <Text color="yellow" dimColor>{'─'.repeat(totalWidth - 4)}</Text>
          </>
        )}

        {/* Completed tasks */}
        {done.length > 0 && (
          <>
            <Box marginTop={1} marginBottom={1}>
              <Text color="yellow" bold>{t('dashboard.section_history')}</Text>
            </Box>
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                focused={allRows.indexOf(task) === cursor}
                barLen={BAR_LEN}
              />
            ))}
          </>
        )}

        {/* Empty state */}
        {tasks.length === 0 && (
          <Box flexDirection="column" paddingY={2}>
            <Text dimColor>{t('dashboard.empty')}</Text>
            <Text dimColor>{t('dashboard.empty_hint', { key: 'N' })}</Text>
          </Box>
        )}
      </Box>

      {/* Command bar */}
      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(totalWidth)}</Text>
        <Box paddingX={2} gap={2}>
          <Text>{yellow('↑↓')}<Text dimColor>{t('keys.navigate')}</Text></Text>
          <Text>{yellow('Enter')}<Text dimColor>{t('keys.monitor')}</Text></Text>
          <Text>{yellow('N')}<Text dimColor> {t('dashboard.new')}</Text></Text>
          {allRows[cursor]?.status === 'running'  && <Text>{yellow('P')}<Text dimColor>{t('keys.pause')}</Text></Text>}
          {allRows[cursor]?.status === 'paused'   && <Text>{yellow('R')}<Text dimColor>{t('keys.resume')}</Text></Text>}
          {['running','paused'].includes(allRows[cursor]?.status) && (
            <Text>{yellow('C')}<Text dimColor>{t('keys.cancel')}</Text></Text>
          )}
          {['completed','failed','cancelled'].includes(allRows[cursor]?.status) && (
            <Text>{yellow('E')}<Text dimColor>{t('keys.reprocess')}</Text></Text>
          )}
          {allRows[cursor] && (
            <Text>{yellow('I')}<Text dimColor>{t('ai.key_impact')}</Text></Text>
          )}
          <Text>{yellow('A')}<Text dimColor>{t('ai.key_ai_config')}</Text></Text>
          <Text>{yellow('M')}<Text dimColor>{t('ai.key_memory')}</Text></Text>
          <Text>{yellow('Q')}<Text dimColor>{t('keys.quit')}</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
