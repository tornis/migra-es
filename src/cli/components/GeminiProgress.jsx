import React from 'react';
import { Box, Text } from 'ink';
import gradient from 'gradient-string';

/**
 * Gemini-style progress bar with gradient
 */
export default function GeminiProgress({ percentage, label, showPercentage = true }) {
  const barLength = 40;
  const filled = Math.floor((percentage / 100) * barLength);
  const empty = barLength - filled;
  
  const geminiGradient = gradient(['#fbbc04', '#f4b400', '#ff9800', '#ffc107']);
  
  // Create gradient bar
  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);
  
  return (
    <Box flexDirection="column">
      {label && (
        <Box marginBottom={1}>
          <Text bold>{label}</Text>
        </Box>
      )}
      <Box>
        <Text>{geminiGradient(filledBar)}</Text>
        <Text dimColor>{emptyBar}</Text>
        {showPercentage && (
          <Text> {geminiGradient(`${percentage}%`)}</Text>
        )}
      </Box>
    </Box>
  );
}
