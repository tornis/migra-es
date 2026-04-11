import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const green  = gradient(['#34a853', '#0f9d58']);
const red    = gradient(['#ea4335', '#c5221f']);
const amber  = gradient(['#B8860B', '#DAA520']);

const STATUS_LABEL = {
  pending:   'Aguardando',
  running:   'Em andamento',
  paused:    'Pausada',
  completed: 'Concluída',
  failed:    'Falhou',
  cancelled: 'Cancelada',
};

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
  return (n ?? 0).toLocaleString('pt-BR');
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, focused, barLen }) {
  const p         = pct(task);
  const rp        = readPct(task);
  const col       = statusColor(task.status);
  const icon      = STATUS_ICON[task.status] ?? '○';
  const isActive  = ['running', 'paused'].includes(task.status);

  const writeBar  = '█'.repeat(Math.round((p  / 100) * barLen)) + '░'.repeat(barLen - Math.round((p  / 100) * barLen));
  const readBar   = '█'.repeat(Math.round((rp / 100) * barLen)) + '░'.repeat(barLen - Math.round((rp / 100) * barLen));

  const written   = task.progress?.written  ?? task.progress?.processed ?? 0;
  const enqueued  = task.progress?.enqueued ?? 0;
  const total     = task.progress?.total    ?? 0;
  const failed    = task.progress?.failed   ?? 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Index name + status */}
      <Box gap={1}>
        {focused ? <Text color="yellow" bold>▶ </Text> : <Text>  </Text>}
        <Text bold={focused} color={focused ? 'white' : undefined}>
          {icon} {task.indexName ?? task.name}
        </Text>
        <Text> </Text>
        <Text>{col(STATUS_LABEL[task.status] ?? task.status)}</Text>
        {task.controlField && (
          <Text dimColor>  ↳ {task.controlField}</Text>
        )}
      </Box>

      {/* Dates */}
      <Box marginLeft={4} gap={3}>
        {fmtDate(task.createdAt) && (
          <Text dimColor>Criado: {fmtDate(task.createdAt)}</Text>
        )}
        {fmtDate(task.completedAt) && (
          <Text dimColor>Concluído: {fmtDate(task.completedAt)}</Text>
        )}
      </Box>

      {/* Progress bars (only when we have data) */}
      {isActive && total > 0 && (
        <Box flexDirection="column" marginLeft={4}>
          <Box gap={1}>
            <Text dimColor>Escrita  </Text>
            <Text>{yellow(writeBar)}</Text>
            <Text> {col(`${p}%`)}</Text>
            <Text dimColor>  {fmt(written)} / {fmt(total)} docs</Text>
            {failed > 0 && <Text color="red">  ✗ {fmt(failed)} falhas</Text>}
          </Box>
          {/* Show read progress only if meaningfully ahead of write */}
          {enqueued > written + 1000 && (
            <Box gap={1}>
              <Text dimColor>Leitura  </Text>
              <Text>{amber(readBar)}</Text>
              <Text> {amber(`${rp}%`)}</Text>
              <Text dimColor>  {fmt(enqueued)} enfileirados</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Completed/failed summary */}
      {!isActive && total > 0 && (
        <Box marginLeft={4}>
          <Text dimColor>
            {fmt(written)} / {fmt(total)} docs
            {failed > 0 && `  ✗ ${fmt(failed)} falhas`}
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
 * @param {Array}    props.tasks    - All task objects (enriched with Redis counters)
 * @param {Function} props.onSelect - Called with a task object to open monitor
 * @param {Function} props.onNew    - Called to start the migration wizard
 */
export default function TaskList({ tasks, onSelect, onNew }) {
  const { stdout } = useStdout();
  const totalWidth = stdout?.columns ?? 80;
  const rows       = stdout?.rows    ?? 24;

  const [cursor, setCursor] = useState(0);

  const active    = tasks.filter(t => ['running', 'paused', 'pending'].includes(t.status));
  const done      = tasks.filter(t => ['completed', 'failed', 'cancelled'].includes(t.status));
  const allRows   = [...active, ...done];

  // Stable bar length (leave room for labels)
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
    // Reprocess completed / failed tasks
    if (focused && (input === 'e' || input === 'E') && ['completed','failed','cancelled'].includes(focused.status)) {
      onSelect({ ...focused, _action: 'reprocess' });
    }
  });

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader />

      {/* Body */}
      <Box flexDirection="column" paddingX={2} flexGrow={1}>

        {/* New migration shortcut */}
        <Box marginBottom={1}>
          <Text>
            {yellow('N')}<Text dimColor> Nova Migração</Text>
          </Text>
          {active.length > 0 && (
            <Text>
              <Text dimColor>  •  </Text>
              <Text color="yellow">● {active.length}</Text>
              <Text dimColor> migração{active.length > 1 ? 'ões' : ''} ativa{active.length > 1 ? 's' : ''}</Text>
            </Text>
          )}
        </Box>

        <Text color="yellow" dimColor>{'─'.repeat(totalWidth - 4)}</Text>

        {/* Active tasks */}
        {active.length > 0 && (
          <>
            <Box marginTop={1} marginBottom={1}>
              <Text color="yellow" bold>Ativas</Text>
            </Box>
            {active.map((task, i) => (
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
              <Text color="yellow" bold>Histórico</Text>
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
            <Text dimColor>Nenhuma migração registrada.</Text>
            <Text dimColor>Pressione <Text color="yellow">N</Text> para iniciar uma nova migração.</Text>
          </Box>
        )}
      </Box>

      {/* Command bar */}
      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(totalWidth)}</Text>
        <Box paddingX={2} gap={2}>
          <Text>{yellow('↑↓')}<Text dimColor> navegar</Text></Text>
          <Text>{yellow('Enter')}<Text dimColor> monitorar</Text></Text>
          <Text>{yellow('N')}<Text dimColor> nova migração</Text></Text>
          {allRows[cursor]?.status === 'running'  && <Text>{yellow('P')}<Text dimColor> pausar</Text></Text>}
          {allRows[cursor]?.status === 'paused'   && <Text>{yellow('R')}<Text dimColor> retomar</Text></Text>}
          {['running','paused'].includes(allRows[cursor]?.status) && (
            <Text>{yellow('C')}<Text dimColor> cancelar</Text></Text>
          )}
          {['completed','failed','cancelled'].includes(allRows[cursor]?.status) && (
            <Text>{yellow('E')}<Text dimColor> reprocessar</Text></Text>
          )}
          <Text>{yellow('Q')}<Text dimColor> sair</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
