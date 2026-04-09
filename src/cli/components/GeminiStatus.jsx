import React from 'react';
import { Box, Text } from 'ink';
import gradient from 'gradient-string';

/**
 * Gemini-style status indicator
 */
export default function GeminiStatus({ status, message }) {
  const statusConfig = {
    success: {
      icon: '✓',
      color: 'green',
      gradient: gradient(['#34a853', '#0f9d58'])
    },
    error: {
      icon: '✗',
      color: 'red',
      gradient: gradient(['#ea4335', '#c5221f'])
    },
    warning: {
      icon: '⚠',
      color: 'yellow',
      gradient: gradient(['#fbbc04', '#f4b400'])
    },
    info: {
      icon: 'ℹ',
      color: 'blue',
      gradient: gradient(['#4285f4', '#1a73e8'])
    },
    loading: {
      icon: '⟳',
      color: 'cyan',
      gradient: gradient(['#00bcd4', '#0097a7'])
    }
  };

  const config = statusConfig[status] || statusConfig.info;

  return (
    <Box>
      <Text>{config.gradient(`${config.icon} `)}</Text>
      <Text>{message}</Text>
    </Box>
  );
}
