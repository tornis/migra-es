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
import AIProviderSelector from './components/AIProviderSelector.jsx';
import ImpactAnalysisView from './components/ImpactAnalysisView.jsx';
import BreakingChangesMemoryView from './components/BreakingChangesMemoryView.jsx';
import { t } from '../i18n/index.js';
import { isAIConfigured } from '../core/ai/aiConfig.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);

const logger = createLogger('CLI');

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [screen,          setScreen]          = useState('loading');
  const [tasks,           setTasks]           = useState([]);
  const [selectedTask,    setSelectedTask]    = useState(null);
  const [reprocessTarget, setReprocessTarget] = useState(null);
  const [impactTask,      setImpactTask]      = useState(null);
  const [aiConfigNext,    setAIConfigNext]    = useState(null);  // screen to go after AI config
  const [error,           setError]           = useState(null);

  const { exit }   = useApp();
  const { stdout } = useStdout();
  const rows  = stdout?.rows    ?? 24;
  const width = stdout?.columns ?? 80;

  // ── Initialisation ──────────────────────────────────────────────────────

  useEffect(() => {
    initialize();
  }, []);

  // ── Live polling ────────────────────────────────────────────────────────

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

  // ── Keyboard ────────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') {
      if (screen === 'home') {
        // exit() restores terminal state; process.exit(0) forces Node to stop
        // (Bull's ioredis connections keep the event loop alive otherwise).
        exit();
        process.exit(0);
      } else if (screen === 'monitor') {
        setScreen('home');
        setSelectedTask(null);
      } else if (screen === 'wizard') {
        setScreen('home');
      } else if (screen === 'ai-config') {
        setScreen('home'); setAIConfigNext(null);
      } else if (screen === 'impact-analysis') {
        setScreen('home'); setImpactTask(null);
      } else if (screen === 'breaking-changes-memory') {
        setScreen('home');
      } else {
        setScreen('home');
      }
      return;
    }

    if (key.escape) {
      if (screen === 'wizard')              setScreen('home');
      if (screen === 'monitor')             { setScreen('home'); setSelectedTask(null); }
      if (screen === 'confirm-reprocess')   handleReprocessCancel();
      if (screen === 'ai-config')           { setScreen('home'); setAIConfigNext(null); }
      if (screen === 'impact-analysis')     { setScreen('home'); setImpactTask(null); }
      if (screen === 'breaking-changes-memory') setScreen('home');
      return;
    }

    // Monitor controls
    if (screen === 'monitor' && selectedTask) {
      if (input === 'p' || input === 'P') handlePauseTask(selectedTask.id);
      if (input === 'r' || input === 'R') handleResumeTask(selectedTask.id);
      if (input === 'c' || input === 'C') handleCancelTask(selectedTask.id);
    }
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  const initialize = async () => {
    try {
      logger.info('Initialising application');

      await initDatabase();
      logger.info('Database initialised');

      const redisOk = await testRedisConnection();
      if (!redisOk) {
        setError(t('init.error_redis'));
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
      setError(`${t('init.error_title')}: ${err.message}`);
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

  // ── Wizard callbacks ────────────────────────────────────────────────────

  const handleNewMigration = () => {
    setScreen('wizard');
  };

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
      setError(`${t('init.error_title')}: ${err.message}`);
      setScreen('home');
    }
  };

  const handleWizardCancel = () => {
    setScreen('home');
  };

  // ── Impact Analysis ──────────────────────────────────────────────────────────

  const handleImpactAnalysis = (task) => {
    setImpactTask(task);
    if (!isAIConfigured()) {
      // Go to AI config first, then come back to impact analysis
      setAIConfigNext('impact-analysis');
      setScreen('ai-config');
    } else {
      setScreen('impact-analysis');
    }
  };

  const handleAIConfig = () => {
    setAIConfigNext('home');
    setScreen('ai-config');
  };

  const handleAIConfigSave = () => {
    const next = aiConfigNext ?? 'home';
    setAIConfigNext(null);
    setScreen(next);
  };

  const handleAIConfigCancel = () => {
    setAIConfigNext(null);
    setScreen('home');
  };

  // ── Task controls ────────────────────────────────────────────────────────

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
      setError(`${t('init.error_title')}: ${err.message}`);
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

  // ── Screens ──────────────────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <Box flexDirection="column" minHeight={rows}>
        <AppHeader />
        <Box paddingX={4} flexGrow={1} flexDirection="column" justifyContent="center">
          <Text>{yellow('⠋')} <Text dimColor>{t('init.loading')}</Text></Text>
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
          <Text color="red" bold>✗  {t('init.error_title')}</Text>
          <Text> </Text>
          <Text color="red">{error}</Text>
          <Text> </Text>
          <Text dimColor>{t('init.error_redis_hint')}</Text>
        </Box>
        <Box flexDirection="column">
          <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
          <Box paddingX={2}>
            <Text>{yellow('Q')}<Text dimColor>{t('keys.quit')}</Text></Text>
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
        onImpact={handleImpactAnalysis}
        onAIConfig={handleAIConfig}
        onMemory={() => setScreen('breaking-changes-memory')}
      />
    );
  }

  if (screen === 'ai-config') {
    return (
      <AIProviderSelector
        onSave={handleAIConfigSave}
        onCancel={handleAIConfigCancel}
      />
    );
  }

  if (screen === 'impact-analysis' && impactTask) {
    return (
      <ImpactAnalysisView
        task={impactTask}
        onBack={() => { setScreen('home'); setImpactTask(null); }}
      />
    );
  }

  if (screen === 'breaking-changes-memory') {
    return (
      <BreakingChangesMemoryView
        onBack={() => setScreen('home')}
      />
    );
  }

  if (screen === 'confirm-reprocess' && reprocessTarget) {
    return (
      <ConfirmDialog
        title={t('reprocess.title')}
        lines={[
          t('reprocess.index_label', { value: reprocessTarget.indexName }),
          t('reprocess.dest_label',  { value: reprocessTarget.destConfig?.url ?? '—' }),
          reprocessTarget.controlField
            ? t('reprocess.control_label', { value: reprocessTarget.controlField })
            : t('reprocess.control_none'),
        ]}
        warning={t('reprocess.warning', { index: reprocessTarget.indexName })}
        confirmLabel={t('reprocess.confirm_label')}
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
