import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const red    = gradient(['#ea4335', '#c5221f']);

/**
 * Full-screen destructive action confirmation dialog.
 *
 * @param {object}   props
 * @param {string}   props.title      - Dialog heading
 * @param {string[]} props.lines      - Description lines (shown before warning)
 * @param {string}   props.warning    - Red warning text
 * @param {string}   props.confirmLabel - Label for the confirm option (default "Sim, confirmar")
 * @param {Function} props.onConfirm
 * @param {Function} props.onCancel
 */
export default function ConfirmDialog({
  title,
  lines = [],
  warning,
  confirmLabel = 'Sim, confirmar',
  onConfirm,
  onCancel,
}) {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows    ?? 24;

  const items = [
    { label: `⚠  ${confirmLabel}`, value: 'yes' },
    { label: '✗  Não, cancelar',    value: 'no'  },
  ];

  useInput((_, key) => {
    if (key.escape) onCancel();
  });

  const handleSelect = (item) => {
    if (item.value === 'yes') onConfirm();
    else onCancel();
  };

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader subtitle={title} />

      <Box flexDirection="column" paddingX={4} flexGrow={1}>

        {/* Description */}
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}

        {lines.length > 0 && <Text> </Text>}

        {/* Warning box */}
        {warning && (
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="red"
            paddingX={2}
            paddingY={0}
            marginBottom={2}
          >
            <Box gap={1}>
              <Text color="red" bold>⚠  ATENÇÃO — AÇÃO DESTRUTIVA E IRREVERSÍVEL</Text>
            </Box>
            <Text color="red">{warning}</Text>
          </Box>
        )}

        {/* Selection */}
        <Text dimColor>O que deseja fazer?</Text>
        <Text> </Text>
        <SelectInput
          items={items}
          onSelect={handleSelect}
          itemComponent={({ isSelected, label }) => (
            <Text color={isSelected ? (label.startsWith('⚠') ? 'red' : 'green') : undefined}
                  bold={isSelected}>
              {isSelected ? '▶ ' : '  '}{label}
            </Text>
          )}
        />
      </Box>

      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2} gap={2}>
          <Text>{yellow('↑↓')}<Text dimColor> navegar</Text></Text>
          <Text>{yellow('Enter')}<Text dimColor> selecionar</Text></Text>
          <Text>{yellow('Esc')}<Text dimColor> cancelar</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
