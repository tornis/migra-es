import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import gradient from 'gradient-string';
import GeminiHeader from './GeminiHeader.jsx';
import GeminiBox from './GeminiBox.jsx';
import GeminiProgress from './GeminiProgress.jsx';
import GeminiSpinner from './GeminiSpinner.jsx';
import GeminiStatus from './GeminiStatus.jsx';

/**
 * Progress monitor component with Gemini-style
 * @param {object} props - Component props
 * @param {object} props.task - Task object
 * @param {Function} props.onPause - Pause callback
 * @param {Function} props.onResume - Resume callback
 * @param {Function} props.onCancel - Cancel callback
 * @param {Function} props.onClose - Close callback
 */
export default function ProgressMonitor({ task, onPause, onResume, onCancel, onClose }) {
  const [elapsed, setElapsed] = useState(0);
  const geminiGradient = gradient(['#fbbc04', '#f4b400', '#ff9800', '#ffc107']);

  useEffect(() => {
    if (task.status === 'running') {
      const startTime = new Date(task.startedAt || task.createdAt).getTime();
      const interval = setInterval(() => {
        const now = Date.now();
        setElapsed(Math.floor((now - startTime) / 1000));
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [task.status, task.startedAt, task.createdAt]);

  const getProgressPercentage = () => {
    if (!task.progress.total || task.progress.total === 0) {
      return 0;
    }
    return Math.floor((task.progress.processed / task.progress.total) * 100);
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getEstimatedTimeRemaining = () => {
    if (task.progress.processed === 0 || elapsed === 0) {
      return 'Calculando...';
    }
    const rate = task.progress.processed / elapsed;
    const remaining = task.progress.total - task.progress.processed;
    const estimatedSeconds = Math.floor(remaining / rate);
    return formatTime(estimatedSeconds);
  };

  const getDocsPerSecond = () => {
    if (elapsed === 0) {
      return 0;
    }
    return Math.floor(task.progress.processed / elapsed);
  };

  const getStatusInfo = () => {
    switch (task.status) {
      case 'running': return { type: 'loading', message: 'Migração em andamento' };
      case 'paused': return { type: 'warning', message: 'Migração pausada' };
      case 'completed': return { type: 'success', message: 'Migração concluída' };
      case 'failed': return { type: 'error', message: 'Migração falhou' };
      case 'cancelled': return { type: 'warning', message: 'Migração cancelada' };
      default: return { type: 'info', message: 'Status desconhecido' };
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <GeminiHeader 
        title={`Migração: ${task.indexName}`}
        subtitle={task.controlField ? `Campo de controle: ${task.controlField}` : 'Sem campo de controle'}
      />

      <GeminiBox title="Status" color={task.status === 'running' ? 'yellow' : task.status === 'failed' ? 'red' : 'yellow'}>
        <Box flexDirection="column">
          {task.status === 'running' && <GeminiSpinner text={getStatusInfo().message} />}
          {task.status !== 'running' && <GeminiStatus status={getStatusInfo().type} message={getStatusInfo().message} />}
          
          {!task.controlField && (
            <Box marginTop={1}>
              <GeminiStatus status="warning" message="Sem campo de controle - migração sem checkpoints" />
            </Box>
          )}
        </Box>
      </GeminiBox>

      <GeminiBox title="Progresso" color="yellow">
        <Box flexDirection="column">
          <GeminiProgress percentage={getProgressPercentage()} showPercentage={true} />
          
          <Box marginTop={1} flexDirection="column">
            <Text>📊 Documentos: {geminiGradient(task.progress.processed.toLocaleString())} / {task.progress.total.toLocaleString()}</Text>
            <Text>
              {task.progress.failed > 0 ? '❌' : '✅'} Falhas: 
              <Text color={task.progress.failed > 0 ? 'red' : 'green'}> {task.progress.failed}</Text>
            </Text>
            <Text>⚡ Taxa: {geminiGradient(getDocsPerSecond() + ' docs/s')}</Text>
          </Box>
        </Box>
      </GeminiBox>

      <GeminiBox title="Tempo" color="yellow">
        <Box flexDirection="column">
          <Text>⏱️  Decorrido: {geminiGradient(formatTime(elapsed))}</Text>
          <Text>⏳ Estimado: {geminiGradient(getEstimatedTimeRemaining())}</Text>
        </Box>
      </GeminiBox>

      {task.error && (
        <GeminiBox title="Erro" color="red">
          <GeminiStatus status="error" message={task.error} />
        </GeminiBox>
      )}

      <Box marginTop={1}>
        {task.status === 'running' && (
          <Text dimColor>{geminiGradient('P')} Pausar  {geminiGradient('C')} Cancelar  {geminiGradient('Q')} Fechar</Text>
        )}
        {task.status === 'paused' && (
          <Text dimColor>{geminiGradient('R')} Retomar  {geminiGradient('C')} Cancelar  {geminiGradient('Q')} Fechar</Text>
        )}
        {(task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') && (
          <Text dimColor>{geminiGradient('Q')} Fechar</Text>
        )}
      </Box>
    </Box>
  );
}
