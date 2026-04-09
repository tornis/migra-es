import React from 'react';
import { Box, Text } from 'ink';
import gradient from 'gradient-string';

/**
 * Gemini-style box with gradient border (responsive)
 */
export default function GeminiBox({ children, title, color = 'blue', variant = 'default' }) {
  const gradients = {
    blue: gradient(['#4285f4', '#34a853']),
    green: gradient(['#34a853', '#0f9d58']),
    yellow: gradient(['#fbbc04', '#f4b400']),
    red: gradient(['#ea4335', '#c5221f']),
    purple: gradient(['#9c27b0', '#673ab7']),
    cyan: gradient(['#00bcd4', '#0097a7'])
  };

  const grad = gradients[color] || gradients.yellow;

  const borders = {
    default: {
      topLeft: '╭',
      topRight: '╮',
      bottomLeft: '╰',
      bottomRight: '╯',
      horizontal: '─',
      vertical: '│'
    },
    double: {
      topLeft: '╔',
      topRight: '╗',
      bottomLeft: '╚',
      bottomRight: '╝',
      horizontal: '═',
      vertical: '║'
    },
    rounded: {
      topLeft: '╭',
      topRight: '╮',
      bottomLeft: '╰',
      bottomRight: '╯',
      horizontal: '─',
      vertical: '│'
    }
  };

  const border = borders[variant] || borders.default;

  const boxWidth = 76; // Fixed width for consistent layout

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Top border */}
      <Box>
        <Text>{grad(border.topLeft + border.horizontal.repeat(boxWidth) + border.topRight)}</Text>
      </Box>
      
      {/* Title */}
      {title && (
        <Box>
          <Text>{grad(border.vertical)} </Text>
          <Box width={boxWidth - 2}>
            <Text bold>{grad(title)}</Text>
          </Box>
          <Text> {grad(border.vertical)}</Text>
        </Box>
      )}
      
      {/* Content */}
      <Box>
        <Text>{grad(border.vertical)} </Text>
        <Box width={boxWidth - 2} flexDirection="column">
          {children}
        </Box>
        <Text> {grad(border.vertical)}</Text>
      </Box>
      
      {/* Bottom border */}
      <Box>
        <Text>{grad(border.bottomLeft + border.horizontal.repeat(boxWidth) + border.bottomRight)}</Text>
      </Box>
    </Box>
  );
}
