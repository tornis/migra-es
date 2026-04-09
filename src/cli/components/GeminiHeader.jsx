import React from 'react';
import { Box, Text } from 'ink';
import gradient from 'gradient-string';

/**
 * Gemini-style header component with gradient
 */
export default function GeminiHeader({ title, subtitle }) {
  const geminiGradient = gradient(['#fbbc04', '#f4b400', '#ff9800', '#ffc107']);
  const headerWidth = 78;
  
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text>{geminiGradient('━'.repeat(headerWidth))}</Text>
      </Box>
      <Box paddingY={1}>
        <Text bold>
          {geminiGradient(`✨  ${title}`)}
        </Text>
      </Box>
      {subtitle && (
        <Box>
          <Text dimColor>   {subtitle}</Text>
        </Box>
      )}
      <Box>
        <Text>{geminiGradient('━'.repeat(headerWidth))}</Text>
      </Box>
    </Box>
  );
}
