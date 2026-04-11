import React, { useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import { t } from '../../i18n/index.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const amber  = gradient(['#B8860B', '#DAA520', '#B8860B']);
const green  = gradient(['#34a853', '#0f9d58', '#34a853']);

// ── Role badge ─────────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  if (role === 'source') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text backgroundColor="yellow" color="black" bold>{t('connection.source_badge')}</Text>
          <Text> </Text>
          <Text>{amber(t('connection.source_tagline'))}</Text>
        </Box>
        <Text dimColor>{t('connection.source_desc')}</Text>
      </Box>
    );
  }

  if (role === 'destination') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text backgroundColor="green" color="black" bold>{t('connection.dest_badge')}</Text>
          <Text> </Text>
          <Text>{green(t('connection.dest_tagline'))}</Text>
        </Box>
        <Text dimColor>{t('connection.dest_desc')}</Text>
      </Box>
    );
  }

  return null;
}

// ── Step summary box (fills in as steps complete) ──────────────────────────────

function StepSummary({ step, config }) {
  if (step < 1) return null;

  const lines = [];

  if (step > 0) lines.push(
    <Text key="url" dimColor>{t('connection.summary.url')}<Text color="white">{config.url || '—'}</Text></Text>
  );
  if (step > 1) lines.push(
    <Text key="auth" dimColor>{t('connection.summary.auth')}<Text color="white">
      {config.user ? `${config.user} / ****` : t('connection.summary.auth_none')}
    </Text></Text>
  );
  if (step > 4) {
    const sslText = config.ssl
      ? t('connection.summary.ssl_yes', {
          value: config.rejectUnauthorized
            ? t('connection.summary.ssl_yes_value')
            : t('connection.summary.ssl_no_value'),
        })
      : t('connection.summary.ssl_no');
    lines.push(
      <Text key="ssl" dimColor>{t('connection.summary.ssl')}<Text color="white">{sslText}</Text></Text>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="yellow" paddingX={1}>
      {lines}
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * @param {object}  props
 * @param {string}  props.title      - Subtitle shown in AppHeader (pre-translated)
 * @param {'source'|'destination'} props.role
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

  // Step labels resolved at render time so locale is respected
  const STEPS = [
    t('connection.steps.url'),
    t('connection.steps.auth'),
    t('connection.steps.user'),
    t('connection.steps.password'),
    t('connection.steps.ssl'),
    t('connection.steps.ssl_verify'),
  ];

  const YES_NO = [
    { label: t('connection.yes'), value: 'yes' },
    { label: t('connection.no'),  value: 'no'  },
  ];

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

        {/* Role badge */}
        <RoleBadge role={role} />

        {/* Config summary box */}
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
            <Text dimColor>{t('connection.url_label')}</Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleUrlSubmit}
              placeholder={role === 'destination'
                ? 'http://localhost:9200'
                : 'http://legacy-es:9200'}
            />
          </Box>
        )}

        {step === 1 && (
          <Box flexDirection="column">
            <Text dimColor>{t('connection.auth_question')}</Text>
            <SelectInput items={YES_NO} onSelect={handleAuthSelect} />
          </Box>
        )}

        {step === 2 && (
          <Box gap={1}>
            <Text dimColor>{t('connection.user_label')}</Text>
            <TextInput value={input} onChange={setInput} onSubmit={handleUserSubmit} />
          </Box>
        )}

        {step === 3 && (
          <Box gap={1}>
            <Text dimColor>{t('connection.pass_label')}</Text>
            <TextInput value={input} onChange={setInput} onSubmit={handlePassSubmit} mask="*" />
          </Box>
        )}

        {step === 4 && (
          <Box flexDirection="column">
            <Text dimColor>{t('connection.ssl_question')}</Text>
            <SelectInput items={YES_NO} onSelect={handleSslSelect} />
          </Box>
        )}

        {step === 5 && (
          <Box flexDirection="column">
            <Text dimColor>{t('connection.ssl_verify_question')}</Text>
            <SelectInput
              items={[
                { label: t('connection.yes_recommended'), value: 'yes' },
                { label: t('connection.no_ignore'),       value: 'no'  },
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
            {yellow('Enter')}<Text dimColor>{t('keys.confirm')}</Text>
            {yellow('Esc')}<Text dimColor>{t('keys.back')}</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
