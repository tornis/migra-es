import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';

/**
 * Connection configuration form component
 * @param {object} props - Component props
 * @param {string} props.title - Form title
 * @param {Function} props.onSubmit - Submit callback
 * @param {Function} props.onCancel - Cancel callback
 */
export default function ConnectionForm({ title, onSubmit, onCancel }) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState({
    url: '',
    user: '',
    password: '',
    ssl: false,
    rejectUnauthorized: true
  });
  const [currentInput, setCurrentInput] = useState('');

  const handleUrlChange = (value) => {
    setCurrentInput(value);
  };

  const handleUrlSubmit = () => {
    setConfig({ ...config, url: currentInput });
    setCurrentInput('');
    setStep(1);
  };

  const handleAuthSelect = (item) => {
    if (item.value === 'yes') {
      setStep(2);
    } else {
      setConfig({ ...config, user: '', password: '' });
      setStep(4);
    }
  };

  const handleUserChange = (value) => {
    setCurrentInput(value);
  };

  const handleUserSubmit = () => {
    setConfig({ ...config, user: currentInput });
    setCurrentInput('');
    setStep(3);
  };

  const handlePasswordChange = (value) => {
    setCurrentInput(value);
  };

  const handlePasswordSubmit = () => {
    setConfig({ ...config, password: currentInput });
    setCurrentInput('');
    setStep(4);
  };

  const handleSslSelect = (item) => {
    const newConfig = { ...config, ssl: item.value === 'yes' };
    setConfig(newConfig);
    if (item.value === 'yes') {
      setStep(5);
    } else {
      onSubmit(newConfig);
    }
  };

  const handleRejectUnauthorizedSelect = (item) => {
    const finalConfig = {
      ...config,
      rejectUnauthorized: item.value === 'yes'
    };
    onSubmit(finalConfig);
  };

  const authOptions = [
    { label: 'Sim', value: 'yes' },
    { label: 'Não', value: 'no' }
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">{title}</Text>
      <Text> </Text>

      {step === 0 && (
        <Box flexDirection="column">
          <Text>URL do Elasticsearch (ex: http://localhost:9200):</Text>
          <TextInput value={currentInput} onChange={handleUrlChange} onSubmit={handleUrlSubmit} />
        </Box>
      )}

      {step === 1 && (
        <Box flexDirection="column">
          <Text>Usa autenticação?</Text>
          <SelectInput items={authOptions} onSelect={handleAuthSelect} />
        </Box>
      )}

      {step === 2 && (
        <Box flexDirection="column">
          <Text>Usuário:</Text>
          <TextInput value={currentInput} onChange={handleUserChange} onSubmit={handleUserSubmit} />
        </Box>
      )}

      {step === 3 && (
        <Box flexDirection="column">
          <Text>Senha:</Text>
          <TextInput value={currentInput} onChange={handlePasswordChange} onSubmit={handlePasswordSubmit} mask="*" />
        </Box>
      )}

      {step === 4 && (
        <Box flexDirection="column">
          <Text>Usa SSL?</Text>
          <SelectInput items={authOptions} onSelect={handleSslSelect} />
        </Box>
      )}

      {step === 5 && (
        <Box flexDirection="column">
          <Text>Ignorar verificação de certificado SSL?</Text>
          <SelectInput 
            items={[
              { label: 'Não (recomendado)', value: 'yes' },
              { label: 'Sim (ignorar)', value: 'no' }
            ]} 
            onSelect={handleRejectUnauthorizedSelect} 
          />
        </Box>
      )}

      <Text> </Text>
      <Text dimColor>ESC para cancelar</Text>
    </Box>
  );
}
