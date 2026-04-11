#!/usr/bin/env node

import React, { useState, useEffect, useRef } from 'react';
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import gradient from 'gradient-string';
import { createLogger } from '../utils/logger.js';
import { initDatabase } from '../database/db.js';
import {
  initReaderQueue, initWriterQueue,
  createMigrationTask, startMigrationTask,
  pauseMigrationTask, resumeMigrationTask, cancelMigrationTask,
  reprocessMigrationTask,
  getTaskStatus, getEnrichedTasks,
} from '../core/tasks/taskManager.js';
import { initQueueProcessor } from '../core/tasks/queue.js';
import { testRedisConnection } from '../core/cache/redisClient.js';
import TaskList from './components/TaskList.jsx';
import MigrationWizard from './wizard.jsx';
import ProgressMonitor from './components/ProgressMonitor.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import AppHeader from './components/AppHeader.jsx';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);

const logger = createLogger('CLI');

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [screen,           setScreen]           = useState('loading');
  const [tasks,            setTasks]            = useState([]);
  const [selectedTask,     setSelectedTask]     = useState(null);
  const [reprocessTarget,  setReprocessTarget]  = useState(null); // task pending confirmation
  const [error,            setError]            = useState(null);

  const { exit }   = useApp();
  const { stdout } = useStdout();
  const rows  = stdout?.rows    ?? 24;
  const width = stdout?.columns ?? 80;

  // ── Initialisation ──────────────────────────────────────────────────────────

  useEffect(() => {
    initialize();
  }, []);

  // ── Live polling ────────────────────────────────────────────────────────────
  // Refresh tasks every 2 s regardless of screen so the dashboard stays live.
  // When a specific task is open in the monitor, also refresh its individual status.

  useEffect(() => {
    const interval = setInterval(async () => {
      await loadTasks();

      if (screen === 'monitor' && selectedTask) {
        try {
          const updated = await getTaskStatus(selectedTask.id);
          setSelectedTask(updated);
        } catch {
          // task may have been removed; ignore
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [screen, selectedTask?.id]);

  // ── Keyboard ────────────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') {
      if (screen === 'home') {
        // exit() restores terminal state (cursor, alt-screen).
        // process.exit(0) is required because Bull queue connections
        // (ioredis) keep the Node.js event loop alive after Ink unmounts.
        exit();
        process.exit(0);
      } else if (screen === 'monitor') {
        setScreen('home');
        setSelectedTask(null);
      } else if (screen === 'wizard') {
        setScreen('home');
      } else {
        setScreen('home');
      }
      return;
    }

    if (key.escape) {
      if (screen === 'wizard')             setScreen('home');
      if (screen === 'monitor')            { setScreen('home'); setSelectedTask(null); }
      if (screen === 'confirm-reprocess')  handleReprocessCancel();
      return;
    }

    // Monitor controls
    if (screen === 'monitor' && selectedTask) {
      if (input === 'p' || input === 'P') handlePauseTask(selectedTask.id);
      if (input === 'r' || input === 'R') handleResumeTask(selectedTask.id);
      if (input === 'c' || input === 'C') handleCancelTask(selectedTask.id);
    }
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const initialize = async () => {
    try {
      logger.info('Initialising application');

      await initDatabase();
      logger.info('Database initialised');

      const redisOk = await testRedisConnection();
      if (!redisOk) {
        setError('Falha ao conectar ao Redis. Certifique-se de que o Redis está rodando.');
        return;
      }
      logger.info('Redis OK');

      initReaderQueue();
      initWriterQueue();
      initQueueProcessor();
      logger.info('Queues initialised');

      await loadTasks();
      setScreen('home');
    } catch (err) {
      logger.error('Initialisation failed', { error: err.message });
      setError(`Erro na inicialização: ${err.message}`);
    }
  };

  const loadTasks = async () => {
    try {
      const enriched = await getEnrichedTasks();
      setTasks(enriched);
    } catch (err) {
      logger.error('Failed to load tasks', { error: err.message });
    }
  };

  // ── Wizard callbacks ─────────────────────────────────────────────────────────

  const handleNewMigration = () => {
    setScreen('wizard');
  };

  /**
   * Wizard complete: receives an array of migration configs (one per index).
   * Creates and starts a task for each one, then returns to the dashboard.
   */
  const handleWizardComplete = async (configs) => {
    try {
      logger.info('Creating migration tasks', { count: configs.length });

      for (const cfg of configs) {
        const task = await createMigrationTask(cfg);
        await startMigrationTask(task.id);
        logger.info('Task started', { taskId: task.id, indexName: cfg.indexName });
      }

      await loadTasks();
      setScreen('home');
    } catch (err) {
      logger.error('Failed to create migration tasks', { error: err.message });
      setError(`Erro ao criar migrações: ${err.message}`);
      setScreen('home');
    }
  };

  const handleWizardCancel = () => {
    setScreen('home');
  };

  // ── Task controls ────────────────────────────────────────────────────────────

  /**
   * Called from TaskList when user selects a task row.
   * Supports inline quick actions via the _action property.
   */
  const handleTaskSelect = async (task) => {
    if (task._action === 'pause')     { await handlePauseTask(task.id);  return; }
    if (task._action === 'resume')    { await handleResumeTask(task.id); return; }
    if (task._action === 'cancel')    { await handleCancelTask(task.id); return; }
    if (task._action === 'reprocess') { setReprocessTarget(task); setScreen('confirm-reprocess'); return; }

    try {
      const enriched = await getTaskStatus(task.id);
      setSelectedTask(enriched);
      setScreen('monitor');
    } catch {
      setSelectedTask(task);
      setScreen('monitor');
    }
  };

  const handleReprocessConfirm = async () => {
    if (!reprocessTarget) return;
    setScreen('home');
    try {
      await reprocessMigrationTask(reprocessTarget.id);
      await loadTasks();
    } catch (err) {
      logger.error('Reprocess failed', { error: err.message });
      setError(`Erro ao reprocessar: ${err.message}`);
    } finally {
      setReprocessTarget(null);
    }
  };

  const handleReprocessCancel = () => {
    setReprocessTarget(null);
    setScreen('home');
  };

  const handlePauseTask = async (taskId) => {
    try {
      await pauseMigrationTask(taskId);
      logger.info('Task pause requested', { taskId });
      await loadTasks();
      if (selectedTask?.id === taskId) {
        setSelectedTask(t => ({ ...t, status: 'paused' }));
      }
    } catch (err) {
      logger.error('Failed to pause task', { taskId, error: err.message });
    }
  };

  const handleResumeTask = async (taskId) => {
    try {
      await resumeMigrationTask(taskId);
      logger.info('Task resumed', { taskId });
      await loadTasks();
      if (selectedTask?.id === taskId) {
        setSelectedTask(t => ({ ...t, status: 'running' }));
      }
    } catch (err) {
      logger.error('Failed to resume task', { taskId, error: err.message });
    }
  };

  const handleCancelTask = async (taskId) => {
    try {
      await cancelMigrationTask(taskId);
      logger.info('Task cancelled', { taskId });
      await loadTasks();
      if (selectedTask?.id === taskId) {
        setScreen('home');
        setSelectedTask(null);
      }
    } catch (err) {
      logger.error('Failed to cancel task', { taskId, error: err.message });
    }
  };

  // ── Screens ──────────────────────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <Box flexDirection="column" minHeight={rows}>
        <AppHeader />
        <Box paddingX={4} flexGrow={1} flexDirection="column" justifyContent="center">
          <Text>{yellow('⠋')} <Text dimColor>Inicializando — Redis, filas de tarefas, banco de dados...</Text></Text>
        </Box>
        <Box flexDirection="column">
          <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" minHeight={rows}>
        <AppHeader />
        <Box paddingX={4} flexGrow={1} flexDirection="column">
          <Text color="red" bold>✗  Erro na inicialização</Text>
          <Text> </Text>
          <Text color="red">{error}</Text>
          <Text> </Text>
          <Text dimColor>Verifique se o Redis está rodando:  redis-cli ping</Text>
        </Box>
        <Box flexDirection="column">
          <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
          <Box paddingX={2}>
            <Text>{yellow('Q')}<Text dimColor> sair</Text></Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (screen === 'home') {
    return (
      <TaskList
        tasks={tasks}
        onSelect={handleTaskSelect}
        onNew={handleNewMigration}
      />
    );
  }

  if (screen === 'confirm-reprocess' && reprocessTarget) {
    return (
      <ConfirmDialog
        title="Reprocessar Migração"
        lines={[
          `Índice:   ${reprocessTarget.indexName}`,
          `Destino:  ${reprocessTarget.destConfig?.url ?? '—'}`,
          reprocessTarget.controlField
            ? `Controle: ${reprocessTarget.controlField}`
            : 'Controle: nenhum',
        ]}
        warning={
          `O índice "${reprocessTarget.indexName}" será APAGADO do servidor de destino ` +
          `e toda a migração será reiniciada do zero. ` +
          `Todos os documentos já migrados serão perdidos.`
        }
        confirmLabel="Sim, apagar e reprocessar"
        onConfirm={handleReprocessConfirm}
        onCancel={handleReprocessCancel}
      />
    );
  }

  if (screen === 'wizard') {
    return (
      <MigrationWizard
        onComplete={handleWizardComplete}
        onCancel={handleWizardCancel}
      />
    );
  }

  if (screen === 'monitor' && selectedTask) {
    return (
      <ProgressMonitor
        task={selectedTask}
        onPause={() => handlePauseTask(selectedTask.id)}
        onResume={() => handleResumeTask(selectedTask.id)}
        onCancel={() => handleCancelTask(selectedTask.id)}
        onClose={() => {
          setScreen('home');
          setSelectedTask(null);
        }}
      />
    );
  }

  return null;
}

// ── Entry-point ───────────────────────────────────────────────────────────────

render(<App />);
logger.info('Application started');
