import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import gradient from 'gradient-string';
import GeminiHeader from './GeminiHeader.jsx';
import GeminiBox from './GeminiBox.jsx';

/**
 * Task list component with Gemini-style
 * @param {object} props - Component props
 * @param {Array} props.tasks - List of tasks
 * @param {Function} props.onSelect - Selection callback
 * @param {Function} props.onNew - New task callback
 */
export default function TaskList({ tasks, onSelect, onNew }) {
  const geminiGradient = gradient(['#fbbc04', '#f4b400', '#ff9800', '#ffc107']);
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'running': return '🚀';
      case 'paused': return '⏸️';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'cancelled': return '⛔';
      default: return '⚪';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return gradient(['#34a853', '#0f9d58']);
      case 'paused': return gradient(['#fbbc04', '#f4b400']);
      case 'completed': return gradient(['#4285f4', '#1a73e8']);
      case 'failed': return gradient(['#ea4335', '#c5221f']);
      case 'cancelled': return gradient(['#9e9e9e', '#757575']);
      default: return gradient(['#ffffff', '#e0e0e0']);
    }
  };

  const getProgressPercentage = (task) => {
    if (!task.progress.total || task.progress.total === 0) {
      return 0;
    }
    return Math.floor((task.progress.processed / task.progress.total) * 100);
  };

  const items = [
    {
      label: geminiGradient('✨ Nova Migração'),
      value: 'new'
    },
    ...tasks.map(task => {
      const statusGrad = getStatusColor(task.status);
      return {
        label: `${getStatusIcon(task.status)} ${task.indexName} - ${statusGrad(task.status)} (${getProgressPercentage(task)}%)`,
        value: task.id,
        task
      };
    })
  ];

  const handleSelect = (item) => {
    if (item.value === 'new') {
      onNew();
    } else {
      onSelect(item.task);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <GeminiHeader 
        title="Elasticsearch Migration Tool v1.0" 
        subtitle="Migração ES5 → ES9 com IA"
      />

      {tasks.length === 0 ? (
        <GeminiBox title="Status" color="yellow">
          <Box flexDirection="column">
            <Text>💡 Nenhuma migração em andamento.</Text>
            <Text dimColor>   Selecione "Nova Migração" para começar.</Text>
          </Box>
        </GeminiBox>
      ) : (
        <GeminiBox title="Migrações Ativas" color="yellow">
          <Box flexDirection="column">
            {tasks.map(task => (
              <Box key={task.id} flexDirection="row" marginY={0}>
                <Text>{getStatusIcon(task.status)} </Text>
                <Text>{task.indexName}</Text>
                <Text> - </Text>
                <Text>{getStatusColor(task.status)(task.status)}</Text>
                <Text> ({geminiGradient(getProgressPercentage(task) + '%')})</Text>
              </Box>
            ))}
          </Box>
        </GeminiBox>
      )}

      <Box marginTop={1}>
        <SelectInput items={items} onSelect={handleSelect} />
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>{geminiGradient('↑↓')} Navegar  {geminiGradient('Enter')} Selecionar  {geminiGradient('Q')} Sair</Text>
      </Box>
    </Box>
  );
}
