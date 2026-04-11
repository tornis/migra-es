import React from 'react';
import { Box, Text, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import { t } from '../../i18n/index.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);

/**
 * Connection selector component.
 * Lists saved connection profiles and offers a "New Connection" option.
 *
 * @param {object}   props
 * @param {Array}    props.connections - Saved connection profiles
 * @param {Function} props.onSelect    - Called with an existing connection object
 * @param {Function} props.onNew       - Called when user wants to create a new connection
 * @param {Function} props.onCancel    - Called when user presses Esc/Q
 */
export default function ConnectionSelector({ connections, onSelect, onNew, onCancel }) {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;

  const items = [
    { label: t('connection.new'), value: '__new__' },
    ...connections.map(c => ({
      label: `${c.name}   ${c.sourceConfig.url} → ${c.destConfig.url}`,
      value: c.id,
      connection: c,
    })),
  ];

  const handleSelect = (item) => {
    if (item.value === '__new__') {
      onNew();
    } else {
      onSelect(item.connection);
    }
  };

  return (
    <Box flexDirection="column" minHeight={stdout?.rows ?? 24}>
      <AppHeader subtitle={t('connection.select_title')} />

      <Box flexDirection="column" paddingX={4} flexGrow={1}>
        {connections.length === 0 ? (
          <Text dimColor>{t('connection.none_saved')}</Text>
        ) : (
          <Text dimColor>{t('connection.select_hint')}</Text>
        )}
        <Text> </Text>
        <SelectInput items={items} onSelect={handleSelect} />
      </Box>

      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2} gap={2}>
          <Text>{yellow('↑↓')}<Text dimColor>{t('keys.navigate')}</Text></Text>
          <Text>{yellow('Enter')}<Text dimColor>{t('keys.select')}</Text></Text>
          <Text>{yellow('Esc')}<Text dimColor>{t('keys.back')}</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
