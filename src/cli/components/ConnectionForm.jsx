import React, { useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const amber  = gradient(['#B8860B', '#DAA520', '#B8860B']);
const green  = gradient(['#34a853', '#0f9d58', '#34a853']);

const YES_NO = [
  { label: 'Sim', value: 'yes' },
  { label: 'Não', value: 'no' },
];

const STEPS = [
  'URL do Elasticsearch',
  'Autenticação',
  'Usuário',
  'Senha',
  'SSL',
  'Verificar certificado SSL',
];

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  if (role === 'source') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text backgroundColor="yellow" color="black" bold> ← ORIGEM </Text>
          <Text> </Text>
          <Text>{amber('Elasticsearch legado (v2 / v5 / v6)')}</Text>
        </Box>
        <Text dimColor>   Servidor de origem — dados que serão migrados</Text>
      </Box>
    );
  }

  if (role === 'destination') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text backgroundColor="green" color="black" bold> → DESTINO </Text>
          <Text> </Text>
          <Text>{green('Elasticsearch moderno (v8 / v9)')}</Text>
        </Box>
        <Text dimColor>   Servidor de destino — receberá os documentos migrados</Text>
      </Box>
    );
  }

  return null;
}

// ── Step summary line (shown for completed steps) ─────────────────────────────

function StepSummary({ step, config }) {
  if (step < 1) return null;

  const lines = [];

  if (step > 0) lines.push(
    <Text key="url" dimColor> URL: <Text color="white">{config.url || '—'}</Text></Text>
  );
  if (step > 1) lines.push(
    <Text key="auth" dimColor> Auth: <Text color="white">{config.user ? `${config.user} / ****` : 'Nenhuma'}</Text></Text>
  );
  if (step > 4) lines.push(
    <Text key="ssl" dimColor> SSL: <Text color="white">{config.ssl ? `Sim (verificar: ${config.rejectUnauthorized ? 'sim' : 'não'})` : 'Não'}</Text></Text>
  );

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="yellow" paddingX={1}>
      {lines}
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * @param {object}  props
 * @param {string}  props.title      - Subtitle shown in AppHeader
 * @param {'source'|'destination'} props.role - Visual badge type
 * @param {Function} props.onSubmit  - Called with the final config object
 * @param {Function} props.onCancel
 */
export default function ConnectionForm({ title, role, onSubmit, onCancel }) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState({
    url: '', user: '', password: '', ssl: false, rejectUnauthorized: true,
  });
  const [input, setInput] = useState('');
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;

  const handleUrlSubmit = () => {
    if (!input.trim()) return;
    setConfig(c => ({ ...c, url: input.trim() }));
    setInput('');
    setStep(1);
  };

  const handleAuthSelect = (item) => {
    if (item.value === 'yes') {
      setStep(2);
    } else {
      setConfig(c => ({ ...c, user: '', password: '' }));
      setStep(4);
    }
  };

  const handleUserSubmit = () => {
    setConfig(c => ({ ...c, user: input }));
    setInput('');
    setStep(3);
  };

  const handlePassSubmit = () => {
    setConfig(c => ({ ...c, password: input }));
    setInput('');
    setStep(4);
  };

  const handleSslSelect = (item) => {
    const updated = { ...config, ssl: item.value === 'yes' };
    setConfig(updated);
    if (item.value === 'yes') {
      setStep(5);
    } else {
      onSubmit(updated);
    }
  };

  const handleRejectSelect = (item) => {
    onSubmit({ ...config, rejectUnauthorized: item.value === 'yes' });
  };

  const progress = `${step + 1} / ${STEPS.length}`;

  return (
    <Box flexDirection="column" minHeight={stdout?.rows ?? 24}>
      <AppHeader subtitle={title} />

      <Box flexDirection="column" paddingX={4} flexGrow={1}>

        {/* Role badge — explicit source/destination indicator */}
        <RoleBadge role={role} />

        {/* Config summary box (fills in as steps complete) */}
        <StepSummary step={step} config={config} />

        {/* Step progress dots */}
        <Box marginBottom={2} gap={2}>
          {STEPS.map((s, i) => (
            <Text key={i}>
              {i < step
                ? <Text color="green">✓</Text>
                : i === step
                  ? <Text>{yellow(`[${i + 1}]`)}</Text>
                  : <Text dimColor>{i + 1}</Text>
              }
            </Text>
          ))}
          <Text dimColor> {progress}</Text>
        </Box>

        {/* Current step label */}
        <Box marginBottom={1}>
          <Text color="yellow" bold>{STEPS[step]}</Text>
        </Box>

        {/* Step inputs */}
        {step === 0 && (
          <Box gap={1}>
            <Text dimColor>URL: </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleUrlSubmit}
              placeholder={role === 'destination' ? 'http://localhost:9200' : 'http://legacy-es:9200'}
            />
          </Box>
        )}

        {step === 1 && (
          <Box flexDirection="column">
            <Text dimColor>Usar autenticação básica (usuário/senha)?</Text>
            <SelectInput items={YES_NO} onSelect={handleAuthSelect} />
          </Box>
        )}

        {step === 2 && (
          <Box gap={1}>
            <Text dimColor>Usuário: </Text>
            <TextInput value={input} onChange={setInput} onSubmit={handleUserSubmit} />
          </Box>
        )}

        {step === 3 && (
          <Box gap={1}>
            <Text dimColor>Senha: </Text>
            <TextInput value={input} onChange={setInput} onSubmit={handlePassSubmit} mask="*" />
          </Box>
        )}

        {step === 4 && (
          <Box flexDirection="column">
            <Text dimColor>Habilitar SSL/TLS?</Text>
            <SelectInput items={YES_NO} onSelect={handleSslSelect} />
          </Box>
        )}

        {step === 5 && (
          <Box flexDirection="column">
            <Text dimColor>Verificar certificado SSL (recomendado para produção)?</Text>
            <SelectInput
              items={[
                { label: 'Sim — verificar (recomendado)', value: 'yes' },
                { label: 'Não — ignorar certificado',      value: 'no'  },
              ]}
              onSelect={handleRejectSelect}
            />
          </Box>
        )}
      </Box>

      {/* Command bar */}
      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2}>
          <Text>
            {yellow('Enter')}<Text dimColor> confirmar   </Text>
            {yellow('Esc')}<Text dimColor> cancelar</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
