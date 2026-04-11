import React from 'react';
import { Box, Text, useStdout } from 'ink';
import gradient from 'gradient-string';

const GRADIENTS = {
  yellow: gradient(['#FFD700', '#FFA500', '#FFEC00']),
  green:  gradient(['#34a853', '#0f9d58']),
  red:    gradient(['#ea4335', '#c5221f']),
  cyan:   gradient(['#00bcd4', '#0097a7']),
  dim:    gradient(['#888888', '#aaaaaa']),
};

export default function GeminiBox({ children, title, color = 'yellow', variant = 'rounded' }) {
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  // leave 4 cols for outer padding (paddingX={2} on parent)
  const boxWidth = Math.max(40, termWidth - 4);
  const innerWidth = boxWidth - 4; // 1 border + 1 space each side

  const grad = GRADIENTS[color] ?? GRADIENTS.yellow;

  const B = variant === 'double'
    ? { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' }
    : { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' };

  const titleLine = title
    ? ` ${title} `
    : '';
  const dashLen = boxWidth - 2 - titleLine.length;
  const topBar   = B.tl + B.h.repeat(Math.max(0, Math.floor(dashLen / 2))) + titleLine + B.h.repeat(Math.max(0, Math.ceil(dashLen / 2))) + B.tr;
  const bottomBar = B.bl + B.h.repeat(boxWidth - 2) + B.br;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>{grad(topBar)}</Text>

      <Box>
        <Text>{grad(B.v + ' ')}</Text>
        <Box width={innerWidth} flexDirection="column">
          {children}
        </Box>
        <Text>{grad(' ' + B.v)}</Text>
      </Box>

      <Text>{grad(bottomBar)}</Text>
    </Box>
  );
}
