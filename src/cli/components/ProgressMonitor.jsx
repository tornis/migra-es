import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import GeminiSpinner from './GeminiSpinner.jsx';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const green  = gradient(['#34a853', '#0f9d58']);
const red    = gradient(['#ea4335', '#c5221f']);
const amber  = gradient(['#B8860B', '#DAA520']);

function fmt(n) {
  return (n ?? 0).toLocaleString('pt-BR');
}

function fmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function pct(a, b) {
  if (!b) return 0;
  return Math.min(100, Math.floor((a / b) * 100));
}

function makeBar(value, total, barLen) {
  const p      = pct(value, total);
  const filled = Math.round((p / 100) * barLen);
  return { bar: '█'.repeat(filled) + '░'.repeat(barLen - filled), p };
}

export default function ProgressMonitor({ task, onPause, onResume, onCancel, onClose }) {
  const [elapsed, setElapsed] = useState(0);
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows    ?? 24;

  useEffect(() => {
    if (task.status !== 'running') return;
    const start = new Date(task.startedAt || task.createdAt).getTime();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [task.status, task.startedAt, task.createdAt]);

  const total    = task.progress?.total    ?? 0;
  const written  = task.progress?.written  ?? task.progress?.processed ?? 0;
  const enqueued = task.progress?.enqueued ?? written;
  const failed   = task.progress?.failed   ?? 0;
  const pending  = task.progress?.pending  ?? 0;
  const readerDone = task.progress?.readerDone ?? false;

  const BAR_LEN   = Math.max(20, width - 28);
  const writePct  = pct(written,  total);
  const readPct   = pct(enqueued, total);
  const writeFilled = Math.round((writePct / 100) * BAR_LEN);
  const readFilled  = Math.round((readPct  / 100) * BAR_LEN);
  const writeBar  = '█'.repeat(writeFilled) + '░'.repeat(BAR_LEN - writeFilled);
  const readBar   = '█'.repeat(readFilled)  + '░'.repeat(BAR_LEN - readFilled);

  const docsPerSec = elapsed > 0 ? Math.floor(written / elapsed) : 0;
  const remaining  = total && written && elapsed > 0
    ? fmtTime(Math.floor(((total - written) / (written / elapsed))))
    : '...';

  const statusColor = {
    running:   yellow,
    paused:    amber,
    completed: green,
    failed:    red,
    cancelled: amber,
  }[task.status] ?? yellow;

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader subtitle={`Monitorando: ${task.indexName}`} />

      <Box flexDirection="column" paddingX={3} flexGrow={1}>

        {/* ── Connection info ──────────────────────────────────────────── */}
        <Box gap={4} marginBottom={1}>
          <Box>
            <Text backgroundColor="yellow" color="black" bold> ← ORIGEM </Text>
            <Text dimColor> {task.sourceConfig?.url ?? '—'}</Text>
          </Box>
          <Box>
            <Text backgroundColor="green" color="black" bold> → DESTINO </Text>
            <Text dimColor> {task.destConfig?.url ?? '—'}</Text>
          </Box>
        </Box>

        <Text color="yellow" dimColor>{'─'.repeat(width - 6)}</Text>

        {/* ── Status ───────────────────────────────────────────────────── */}
        <Box marginTop={1} marginBottom={1} gap={2}>
          <Text color="yellow" bold>Status</Text>
          {task.status === 'running'
            ? <GeminiSpinner text="Migrando documentos" />
            : <Text>{statusColor((task.status || '').toUpperCase())}</Text>
          }
          {task.error && <Text color="red">  ✗ {task.error}</Text>}
        </Box>

        {/* ── Write progress bar ────────────────────────────────────────── */}
        <Box flexDirection="column" marginBottom={1}>
          <Box gap={1}>
            <Text dimColor bold>Escrita  </Text>
            <Text>{yellow(writeBar)}</Text>
            <Text> {statusColor(`${writePct}%`)}</Text>
          </Box>
          <Box marginLeft={9} gap={4}>
            <Text>
              <Text dimColor>Indexados  </Text>
              {yellow(fmt(written))}
              <Text dimColor> / {fmt(total)}</Text>
            </Text>
            <Text>
              <Text dimColor>Falhas  </Text>
              {failed > 0 ? <Text color="red">{fmt(failed)}</Text> : <Text color="green">0</Text>}
            </Text>
            <Text>
              <Text dimColor>Taxa  </Text>
              {yellow(`${docsPerSec} docs/s`)}
            </Text>
          </Box>
        </Box>

        {/* ── Read progress bar (shown when meaningfully different) ──── */}
        {total > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Box gap={1}>
              <Text dimColor bold>Leitura  </Text>
              <Text>{amber(readBar)}</Text>
              <Text> {amber(`${readPct}%`)}</Text>
              {readerDone && <Text color="green">  ✓ leitura concluída</Text>}
            </Box>
            <Box marginLeft={9} gap={4}>
              <Text>
                <Text dimColor>Enfileirados  </Text>
                {amber(fmt(enqueued))}
                <Text dimColor> / {fmt(total)}</Text>
              </Text>
              {pending > 0 && (
                <Text>
                  <Text dimColor>Batches pendentes  </Text>
                  {amber(String(pending))}
                </Text>
              )}
            </Box>
          </Box>
        )}

        {/* ── Time ────────────────────────────────────────────────────── */}
        <Box gap={6} marginBottom={1}>
          <Text><Text dimColor>Decorrido  </Text>{yellow(fmtTime(elapsed))}</Text>
          {task.status === 'running' && <Text><Text dimColor>Restante  </Text>{yellow(remaining)}</Text>}
        </Box>

        {/* ── Checkpoint info ──────────────────────────────────────────── */}
        {task.controlField ? (
          <Box>
            <Text dimColor>
              Checkpoint: campo <Text color="white">{task.controlField}</Text>
              {task.progress?.lastControlValue != null &&
                <Text>  →  última posição: <Text color="white">{String(task.progress.lastControlValue)}</Text></Text>
              }
            </Text>
          </Box>
        ) : (
          <Box>
            <Text color="yellow" dimColor>⚠  Sem campo de controle — checkpoint desativado</Text>
          </Box>
        )}
      </Box>

      {/* ── Command bar ──────────────────────────────────────────────── */}
      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2} gap={2}>
          {task.status === 'running' && (
            <>
              <Text>{yellow('P')}<Text dimColor> pausar</Text></Text>
              <Text>{yellow('C')}<Text dimColor> cancelar</Text></Text>
            </>
          )}
          {task.status === 'paused' && (
            <>
              <Text>{yellow('R')}<Text dimColor> retomar</Text></Text>
              <Text>{yellow('C')}<Text dimColor> cancelar</Text></Text>
            </>
          )}
          <Text>{yellow('Q')}<Text dimColor> fechar</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
