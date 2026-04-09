#!/usr/bin/env node

import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { createLogger } from '../utils/logger.js';
import { initDatabase, getAllTasks } from '../database/db.js';
import { initQueue, createMigrationTask, startMigrationTask, getTaskStatus, pauseMigrationTask, resumeMigrationTask, cancelMigrationTask } from '../core/tasks/taskManager.js';
import { initQueueProcessor } from '../core/tasks/queue.js';
import { testRedisConnection } from '../core/cache/redisClient.js';
import TaskList from './components/TaskList.jsx';
import MigrationWizard from './wizard.jsx';
import ProgressMonitor from './components/ProgressMonitor.jsx';

const logger = createLogger('CLI');

/**
 * Main application component
 */
function App() {
  const [screen, setScreen] = useState('loading');
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [error, setError] = useState(null);
  const { exit } = useApp();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (selectedTask && screen === 'monitor') {
      const interval = setInterval(async () => {
        try {
          const status = await getTaskStatus(selectedTask.id);
          setSelectedTask(status);
        } catch (err) {
          logger.error('Failed to update task status', { error: err.message });
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [selectedTask, screen]);

  useInput((input, key) => {
    // Handle Q to quit from any screen
    if (input === 'q' || input === 'Q') {
      if (screen === 'home') {
        exit();
      } else if (screen === 'monitor') {
        setScreen('home');
        setSelectedTask(null);
        loadTasks();
      } else if (screen === 'wizard') {
        setScreen('home');
      } else {
        // From any other screen, go back to home
        setScreen('home');
      }
      return;
    }

    // Handle ESC to cancel/go back
    if (key.escape) {
      if (screen === 'wizard') {
        setScreen('home');
      } else if (screen === 'monitor') {
        setScreen('home');
        setSelectedTask(null);
        loadTasks();
      }
      return;
    }

    // Monitor-specific controls
    if (screen === 'monitor' && selectedTask) {
      if (input === 'p' || input === 'P') {
        handlePauseTask();
      } else if (input === 'r' || input === 'R') {
        handleResumeTask();
      } else if (input === 'c' || input === 'C') {
        handleCancelTask();
      }
    }
  });

  const initialize = async () => {
    try {
      logger.info('Initializing application');

      // Initialize database
      await initDatabase();
      logger.info('Database initialized');

      // Test Redis connection
      const redisOk = await testRedisConnection();
      if (!redisOk) {
        setError('Falha ao conectar ao Redis. Certifique-se de que o Redis está rodando.');
        return;
      }
      logger.info('Redis connection successful');

      // Initialize queue
      initQueue();
      initQueueProcessor();
      logger.info('Queue initialized');

      // Load tasks
      await loadTasks();

      setScreen('home');
    } catch (err) {
      logger.error('Initialization failed', { error: err.message });
      setError(`Erro na inicialização: ${err.message}`);
    }
  };

  const loadTasks = async () => {
    try {
      const allTasks = await getAllTasks();
      setTasks(allTasks);
      logger.debug('Tasks loaded', { count: allTasks.length });
    } catch (err) {
      logger.error('Failed to load tasks', { error: err.message });
    }
  };

  const handleNewMigration = () => {
    setScreen('wizard');
  };

  const handleWizardComplete = async (config) => {
    try {
      logger.info('Creating migration task', { indexName: config.indexName });
      const task = await createMigrationTask(config);
      
      // Start the task
      await startMigrationTask(task.id);
      
      // Monitor the task
      setSelectedTask(task);
      setScreen('monitor');
      
      // Reload tasks
      await loadTasks();
    } catch (err) {
      logger.error('Failed to create migration task', { error: err.message });
      setError(`Erro ao criar migração: ${err.message}`);
      setScreen('home');
    }
  };

  const handleWizardCancel = () => {
    setScreen('home');
  };

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
    setScreen('monitor');
  };

  const handlePauseTask = async () => {
    try {
      await pauseMigrationTask(selectedTask.id);
      logger.info('Task paused', { taskId: selectedTask.id });
    } catch (err) {
      logger.error('Failed to pause task', { error: err.message });
    }
  };

  const handleResumeTask = async () => {
    try {
      await resumeMigrationTask(selectedTask.id);
      logger.info('Task resumed', { taskId: selectedTask.id });
    } catch (err) {
      logger.error('Failed to resume task', { error: err.message });
    }
  };

  const handleCancelTask = async () => {
    try {
      await cancelMigrationTask(selectedTask.id);
      logger.info('Task cancelled', { taskId: selectedTask.id });
      setScreen('home');
      setSelectedTask(null);
      await loadTasks();
    } catch (err) {
      logger.error('Failed to cancel task', { error: err.message });
    }
  };

  if (screen === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Inicializando aplicação...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>Erro:</Text>
        <Text color="red">{error}</Text>
        <Text> </Text>
        <Text dimColor>Pressione Q para sair</Text>
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
        onPause={handlePauseTask}
        onResume={handleResumeTask}
        onCancel={handleCancelTask}
        onClose={() => {
          setScreen('home');
          setSelectedTask(null);
          loadTasks();
        }}
      />
    );
  }

  return null;
}

// Render the app
render(<App />);

logger.info('Application started');
