import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import { saveAIConfig, loadAIConfig, PROVIDERS, DEFAULT_MODELS } from '../../core/ai/aiConfig.js';
import { t } from '../../i18n/index.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);

const PROVIDER_ITEMS = [
  { label: '  Claude (Anthropic)', value: 'claude' },
  { label: '  OpenAI (GPT-4o, etc.)', value: 'openai' },
  { label: '  Gemini (Google)', value: 'gemini' },
  { label: '  Custom (OpenAI-compatible API)', value: 'custom' },
];

const PROVIDER_LABELS = {
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
  custom: 'Custom',
};

export default function AIProviderSelector({ onSave, onCancel }) {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows    ?? 24;

  const existing = loadAIConfig();

  const [step,     setStep]     = useState('provider');
  const [provider, setProvider] = useState(existing?.provider ?? 'claude');
  const [model,    setModel]    = useState(existing?.model    ?? DEFAULT_MODELS['claude']);
  const [apiKey,   setApiKey]   = useState('');
  const [baseUrl,  setBaseUrl]  = useState(existing?.baseUrl  ?? '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  // ── Handlers (defined before useInput) ──────────────────────────────────────

  const handleConfirm = () => {
    if (saving) return;
    setSaving(true);
    const key = apiKey.trim() || existing?.apiKey || '';
    const cfg = {
      provider,
      model,
      apiKey: key,
      ...(provider === 'custom' ? { baseUrl } : {}),
    };
    saveAIConfig(cfg);
    onSave(cfg);
  };

  const handleProviderSelect = (item) => {
    setProvider(item.value);
    setModel(DEFAULT_MODELS[item.value] ?? '');
    setStep('model');
  };

  const handleModelSubmit = (val) => {
    const m = val.trim();
    if (!m) { setError(t('ai.error_model_required')); return; }
    setError(null);
    setModel(m);
    setStep('apiKey');
  };

  const handleApiKeySubmit = (val) => {
    const k = val.trim() || existing?.apiKey || '';
    if (!k) { setError(t('ai.error_apikey_required')); return; }
    setError(null);
    setApiKey(k);
    if (provider === 'custom') {
      setStep('baseUrl');
    } else {
      setStep('confirm');
    }
  };

  const handleBaseUrlSubmit = (val) => {
    const u = val.trim();
    if (!u) { setError(t('ai.error_baseurl_required')); return; }
    setError(null);
    setBaseUrl(u);
    setStep('confirm');
  };

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'provider') { onCancel(); return; }
      if (step === 'model')    { setStep('provider'); return; }
      if (step === 'apiKey')   { setStep('model');    return; }
      if (step === 'baseUrl')  { setStep('apiKey');   return; }
      if (step === 'confirm')  { setStep(provider === 'custom' ? 'baseUrl' : 'apiKey'); return; }
    }
    if (key.return && step === 'confirm' && !saving) {
      handleConfirm();
    }
  });

  // ── Masked key display ────────────────────────────────────────────────────

  const displayKey = apiKey
    ? apiKey.slice(0, 4) + '•'.repeat(Math.max(0, apiKey.length - 8)) + apiKey.slice(-4)
    : (existing?.apiKey ? '(unchanged)' : '');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader />

      <Box flexDirection="column" paddingX={4} flexGrow={1} gap={1}>
        <Text bold color="yellow">{t('ai.config_title')}</Text>
        <Text color="yellow" dimColor>{'─'.repeat(width - 8)}</Text>

        {step === 'provider' && (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>{t('ai.select_provider')}</Text>
            <SelectInput
              items={PROVIDER_ITEMS}
              initialIndex={Math.max(0, PROVIDERS.indexOf(provider))}
              onSelect={handleProviderSelect}
            />
          </Box>
        )}

        {step === 'model' && (
          <Box flexDirection="column" gap={1}>
            <Text>
              <Text dimColor>{t('ai.provider_label')}: </Text>
              <Text color="yellow">{PROVIDER_LABELS[provider]}</Text>
            </Text>
            <Text dimColor>{t('ai.model_hint')}</Text>
            <Box gap={1}>
              <Text dimColor>{t('ai.model_label')}: </Text>
              <TextInput
                value={model}
                onChange={setModel}
                onSubmit={handleModelSubmit}
                placeholder={DEFAULT_MODELS[provider]}
              />
            </Box>
            {error && <Text color="red">{error}</Text>}
          </Box>
        )}

        {step === 'apiKey' && (
          <Box flexDirection="column" gap={1}>
            <Text>
              <Text dimColor>{t('ai.provider_label')}: </Text>
              <Text color="yellow">{PROVIDER_LABELS[provider]}</Text>
              <Text dimColor>  {t('ai.model_label')}: </Text>
              <Text color="yellow">{model}</Text>
            </Text>
            <Text dimColor>{t('ai.apikey_hint')}</Text>
            <Box gap={1}>
              <Text dimColor>{t('ai.apikey_label')}: </Text>
              <TextInput
                value={apiKey}
                onChange={setApiKey}
                onSubmit={handleApiKeySubmit}
                mask="•"
                placeholder={existing?.apiKey ? '(blank = keep current)' : 'paste your API key'}
              />
            </Box>
            {existing?.apiKey && (
              <Text dimColor>{t('ai.apikey_current')}</Text>
            )}
            {error && <Text color="red">{error}</Text>}
          </Box>
        )}

        {step === 'baseUrl' && (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>{t('ai.baseurl_hint')}</Text>
            <Box gap={1}>
              <Text dimColor>{t('ai.baseurl_label')}: </Text>
              <TextInput
                value={baseUrl}
                onChange={setBaseUrl}
                onSubmit={handleBaseUrlSubmit}
                placeholder="https://my-llm-api.example.com/v1"
              />
            </Box>
            {error && <Text color="red">{error}</Text>}
          </Box>
        )}

        {step === 'confirm' && (
          <Box flexDirection="column" gap={1}>
            <Text bold>{t('ai.confirm_title')}</Text>
            <Box flexDirection="column" marginLeft={2}>
              <Text><Text dimColor>{t('ai.provider_label')}:  </Text><Text color="yellow">{PROVIDER_LABELS[provider]}</Text></Text>
              <Text><Text dimColor>{t('ai.model_label')}:     </Text><Text color="yellow">{model}</Text></Text>
              <Text><Text dimColor>{t('ai.apikey_label')}:    </Text><Text color="yellow">{displayKey}</Text></Text>
              {provider === 'custom' && (
                <Text><Text dimColor>{t('ai.baseurl_label')}: </Text><Text color="yellow">{baseUrl}</Text></Text>
              )}
            </Box>
            {saving
              ? <Text dimColor>{t('ai.saving')}</Text>
              : <Text dimColor>{t('ai.confirm_hint')}</Text>
            }
          </Box>
        )}
      </Box>

      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2} gap={2}>
          {step === 'confirm' && !saving && (
            <Text>{yellow('Enter')}<Text dimColor>{t('keys.confirm')}</Text></Text>
          )}
          <Text>{yellow('Esc')}<Text dimColor>{t('keys.back')}</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
