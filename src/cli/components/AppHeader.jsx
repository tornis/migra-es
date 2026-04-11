import React from 'react';
import { Box, Text, useStdout } from 'ink';
import gradient from 'gradient-string';
import { t } from '../../i18n/index.js';

// ANSI Shadow font — "MIGRA-ES"
const LOGO = [
  '███╗   ███╗██╗ ██████╗ ██████╗  █████╗      ███████╗███████╗',
  '████╗ ████║██║██╔════╝ ██╔══██╗██╔══██╗     ██╔════╝██╔════╝',
  '██╔████╔██║██║██║  ███╗██████╔╝███████║     █████╗  ███████╗',
  '██║╚██╔╝██║██║██║   ██║██╔══██╗██╔══██║─    ██╔══╝  ╚════██║',
  '██║ ╚═╝ ██║██║╚██████╔╝██║  ██║██║  ██║     ███████╗███████║',
  '╚═╝     ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝     ╚══════╝╚══════╝',
];

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const dim    = gradient(['#B8860B', '#DAA520', '#B8860B']);

export default function AppHeader({ subtitle }) {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const bar = '─'.repeat(width);

  return (
    <Box flexDirection="column">
      <Text color="yellow" dimColor>{bar}</Text>

      <Box flexDirection="column" paddingLeft={2} paddingTop={1} paddingBottom={1}>
        {LOGO.map((line, i) => (
          <Text key={i}>{yellow(line)}</Text>
        ))}
      </Box>

      <Box paddingLeft={2} flexDirection="column" paddingBottom={1}>
        <Text>{dim(t('app.tagline'))}</Text>
        <Text dimColor>  {t('app.company')}</Text>
      </Box>

      {subtitle && (
        <Box paddingLeft={2} paddingBottom={1}>
          <Text color="yellow" dimColor>{subtitle}</Text>
        </Box>
      )}

      <Text color="yellow" dimColor>{bar}</Text>
    </Box>
  );
}
