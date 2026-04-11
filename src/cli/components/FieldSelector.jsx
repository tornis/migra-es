import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);

function extractFields(properties, prefix = '') {
  const sortable = ['long','integer','short','byte','double','float','half_float','scaled_float','date','date_nanos','keyword'];
  const fields = [];
  for (const [name, cfg] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (sortable.includes(cfg.type)) fields.push({ name: path, type: cfg.type });
    if (cfg.properties) fields.push(...extractFields(cfg.properties, path));
    if (cfg.fields)     fields.push(...extractFields(cfg.fields, path));
  }
  return fields;
}

export default function FieldSelector({ mapping, onSelect, onCancel }) {
  const [items, setItems] = useState([]);
  const [hasFields, setHasFields] = useState(true);
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows ?? 24;

  useEffect(() => {
    if (!mapping) return;
    let props = mapping.properties;
    if (!props) {
      for (const v of Object.values(mapping)) {
        if (v?.properties) { props = v.properties; break; }
      }
    }

    const NO_CTRL = {
      label: yellow('  ⚠  Migrar SEM campo de controle (não recomendado)'),
      value: null,
      isNoControl: true,
    };

    if (!props) {
      setHasFields(false);
      setItems([NO_CTRL]);
      return;
    }

    const fields = extractFields(props);
    if (fields.length === 0) {
      setHasFields(false);
      setItems([NO_CTRL]);
    } else {
      setHasFields(true);
      setItems([
        ...fields.map(f => ({ label: `  ${f.name.padEnd(40)} ${f.type}`, value: f.name })),
        NO_CTRL,
      ]);
    }
  }, [mapping]);

  if (items.length === 0) {
    return (
      <Box flexDirection="column" minHeight={rows}>
        <AppHeader subtitle="Campo de Controle" />
        <Box paddingX={4}><Text color="yellow">Carregando campos...</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader subtitle="Campo de Controle" />

      <Box flexDirection="column" paddingX={4} flexGrow={1}>
        {hasFields ? (
          <>
            <Box marginBottom={1}>
              <Text dimColor>Campo numérico ou data usado como checkpoint de retomada.</Text>
            </Box>
            <Box marginBottom={1} flexDirection="column">
              <Text dimColor>  Tipos aceitos: long, integer, date, date_nanos, keyword…</Text>
            </Box>
          </>
        ) : (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="yellow">Nenhum campo numérico ou de data encontrado.</Text>
            <Text dimColor>Sem checkpoint: não será possível pausar/retomar a migração.</Text>
          </Box>
        )}

        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      </Box>

      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2}>
          <Text>
            {yellow('↑↓')}<Text dimColor> navegar   </Text>
            {yellow('Enter')}<Text dimColor> selecionar   </Text>
            {yellow('Esc')}<Text dimColor> cancelar</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
