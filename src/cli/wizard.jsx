import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import gradient from 'gradient-string';
import { randomUUID } from 'crypto';
import ConnectionForm from './components/ConnectionForm.jsx';
import ConnectionSelector from './components/ConnectionSelector.jsx';
import MultiIndexSelector from './components/MultiIndexSelector.jsx';
import AppHeader from './components/AppHeader.jsx';
import GeminiSpinner from './components/GeminiSpinner.jsx';
import { createElasticsearchClient, testConnection } from '../core/elasticsearch/client.js';
import { listIndices, getIndexMapping } from '../core/elasticsearch/indexManager.js';
import { getAllConnections, saveConnection } from '../database/connections.js';
import { extractSortableFields } from '../utils/fieldUtils.js';
import { createLogger } from '../utils/logger.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);

const logger = createLogger('Wizard');

// Steps where a TextInput is active — suppress the global Q/Esc handler
const TEXT_INPUT_STEPS = new Set(['save-connection']);

/**
 * Migration wizard.
 *
 * Flow:
 *   loading-connections → select-connection
 *     ├─ existing  → test both connections → loading-indices → select-indices
 *     └─ new       → source → destination → save-connection → loading-indices → select-indices
 *
 * @param {object}   props
 * @param {Function} props.onComplete  - Called with Array<{name, sourceConfig, destConfig, indexName, controlField}>
 * @param {Function} props.onCancel
 */
export default function MigrationWizard({ onComplete, onCancel }) {
  const [step,           setStep]           = useState('loading-connections');
  const [connections,    setConnections]    = useState([]);
  const [sourceConfig,   setSourceConfig]   = useState(null);
  const [destConfig,     setDestConfig]     = useState(null);
  const [connectionName, setConnectionName] = useState('');
  const [indices,        setIndices]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [loadingText,    setLoadingText]    = useState('Carregando...');
  const [error,          setError]          = useState(null);

  const { stdout } = useStdout();
  const rows  = stdout?.rows    ?? 24;
  const width = stdout?.columns ?? 80;

  // ── Load saved connections on mount ───────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const conns = await getAllConnections();
        setConnections(conns);
      } catch (err) {
        logger.error('Failed to load connections', { error: err.message });
      }
      setStep('select-connection');
    })();
  }, []);

  // ── Global keyboard handler ────────────────────────────────────────────────

  useInput((input, key) => {
    if (TEXT_INPUT_STEPS.has(step)) return;

    if (key.escape || input === 'q' || input === 'Q') {
      if (error) {
        setError(null);
        setStep('select-connection');
      } else {
        onCancel();
      }
    }
  });

  // ─── Connection selection ─────────────────────────────────────────────────

  const handleExistingConnection = async (connection) => {
    setLoading(true);
    setError(null);

    const sc = connection.sourceConfig;
    const dc = connection.destConfig;

    try {
      setLoadingText('Testando conexão de origem...');
      logger.info('Testing source', { url: sc.url });
      const srcClient = await createElasticsearchClient(sc);
      const srcResult = await testConnection(srcClient);
      await srcClient.close();

      if (!srcResult.success) {
        setError(`Falha na conexão de origem (${sc.url}):\n${srcResult.error}`);
        setLoading(false);
        return;
      }
      logger.info('Source OK', { version: srcResult.version });

      setLoadingText('Testando conexão de destino...');
      logger.info('Testing destination', { url: dc.url });
      const dstClient = await createElasticsearchClient(dc);
      const dstResult = await testConnection(dstClient);
      await dstClient.close();

      if (!dstResult.success) {
        setError(`Falha na conexão de destino (${dc.url}):\n${dstResult.error}`);
        setLoading(false);
        return;
      }
      logger.info('Destination OK', { version: dstResult.version });

      setSourceConfig(sc);
      setDestConfig(dc);
      await loadIndicesFromConfig(sc);
    } catch (err) {
      logger.error('Connection test failed', { error: err.message });
      setError(`Erro ao testar conexões: ${err.message}`);
      setLoading(false);
    }
  };

  const handleNewConnection = () => {
    setSourceConfig(null);
    setDestConfig(null);
    setConnectionName('');
    setStep('source');
  };

  // ─── Source / Destination forms ───────────────────────────────────────────

  const handleSourceSubmit = async (config) => {
    setLoading(true);
    setLoadingText('Testando conexão de origem...');
    setError(null);

    try {
      const client = await createElasticsearchClient(config);
      const result = await testConnection(client);
      await client.close();

      if (result.success) {
        logger.info('Source connection OK', { version: result.version });
        setSourceConfig(config);
        setStep('destination');
      } else {
        setError(`Falha na conexão de origem: ${result.error}`);
      }
    } catch (err) {
      setError(`Erro ao conectar à origem: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDestSubmit = async (config) => {
    setLoading(true);
    setLoadingText('Testando conexão de destino...');
    setError(null);

    try {
      const client = await createElasticsearchClient(config);
      const result = await testConnection(client);
      await client.close();

      if (result.success) {
        logger.info('Destination connection OK', { version: result.version });
        setDestConfig(config);
        setStep('save-connection');
      } else {
        setError(`Falha na conexão de destino: ${result.error}`);
      }
    } catch (err) {
      setError(`Erro ao conectar ao destino: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Save connection profile ──────────────────────────────────────────────

  const handleSaveConnectionSubmit = async () => {
    const name = connectionName.trim();
    if (!name) return;

    setLoading(true);
    setLoadingText('Salvando conexão...');

    try {
      const conn = { id: randomUUID(), name, sourceConfig, destConfig };
      await saveConnection(conn);
      setConnections(prev => [...prev, conn]);
      logger.info('Connection profile saved', { name });
    } catch (err) {
      logger.error('Failed to save connection', { error: err.message });
      // Non-fatal — continue to index loading
    }

    await loadIndicesFromConfig(sourceConfig);
  };

  // ─── Index loading ────────────────────────────────────────────────────────

  const loadIndicesFromConfig = async (srcConfig) => {
    setLoadingText('Carregando lista de índices...');
    try {
      const client = await createElasticsearchClient(srcConfig);
      const indexList = await listIndices(client);
      await client.close();
      setIndices(indexList);
      setStep('select-indices');
    } catch (err) {
      logger.error('Failed to load indices', { error: err.message });
      setError(`Erro ao carregar índices: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Field loading (passed as callback to MultiIndexSelector) ────────────

  const handleLoadFields = async (indexName) => {
    const client = await createElasticsearchClient(sourceConfig);
    try {
      const mapping = await getIndexMapping(client, indexName);
      return extractSortableFields(mapping);
    } finally {
      await client.close().catch(() => {});
    }
  };

  // ─── Multi-index confirmation ─────────────────────────────────────────────

  const handleConfirmMigrations = (queue) => {
    const configs = queue.map(item => ({
      name: `Migration: ${item.indexName}`,
      sourceConfig,
      destConfig,
      indexName: item.indexName,
      controlField: item.controlField,
    }));
    onComplete(configs);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box flexDirection="column" minHeight={rows}>
        <AppHeader />
        <Box paddingX={4} flexGrow={1}>
          <GeminiSpinner text={loadingText} />
        </Box>
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" minHeight={rows}>
        <AppHeader />
        <Box paddingX={4} flexGrow={1} flexDirection="column">
          <Text color="red" bold>✗  Erro de conexão</Text>
          <Text> </Text>
          <Text color="red">{error}</Text>
          <Text> </Text>
          <Text dimColor>Pressione Esc para voltar à seleção de conexões</Text>
        </Box>
        <Box flexDirection="column">
          <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
          <Box paddingX={2}>
            <Text>{yellow('Esc')}<Text dimColor> voltar</Text></Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (step === 'loading-connections') {
    return (
      <Box flexDirection="column" minHeight={rows}>
        <AppHeader />
        <Box paddingX={4} flexGrow={1}>
          <GeminiSpinner text="Carregando conexões salvas..." />
        </Box>
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
      </Box>
    );
  }

  if (step === 'select-connection') {
    return (
      <ConnectionSelector
        connections={connections}
        onSelect={handleExistingConnection}
        onNew={handleNewConnection}
        onCancel={onCancel}
      />
    );
  }

  if (step === 'source') {
    return (
      <ConnectionForm
        title="Configuração do Servidor de Origem"
        role="source"
        onSubmit={handleSourceSubmit}
        onCancel={onCancel}
      />
    );
  }

  if (step === 'destination') {
    return (
      <ConnectionForm
        title="Configuração do Servidor de Destino"
        role="destination"
        onSubmit={handleDestSubmit}
        onCancel={onCancel}
      />
    );
  }

  if (step === 'save-connection') {
    return (
      <Box flexDirection="column" minHeight={rows}>
        <AppHeader subtitle="Salvar Conexão" />
        <Box paddingX={4} flexGrow={1} flexDirection="column">

          <Text color="yellow" bold>Conexões testadas com sucesso</Text>
          <Text> </Text>

          {/* Source summary */}
          <Box borderStyle="single" borderColor="yellow" paddingX={2} paddingY={0} marginBottom={1} flexDirection="column">
            <Box gap={1}>
              <Text backgroundColor="yellow" color="black" bold> ← ORIGEM </Text>
              <Text color="white">{sourceConfig?.url}</Text>
            </Box>
            {sourceConfig?.user && (
              <Text dimColor>   Usuário: {sourceConfig.user}</Text>
            )}
            <Text dimColor>   SSL: {sourceConfig?.ssl ? 'Sim' : 'Não'}</Text>
          </Box>

          {/* Destination summary */}
          <Box borderStyle="single" borderColor="green" paddingX={2} paddingY={0} marginBottom={1} flexDirection="column">
            <Box gap={1}>
              <Text backgroundColor="green" color="black" bold> → DESTINO </Text>
              <Text color="white">{destConfig?.url}</Text>
            </Box>
            {destConfig?.user && (
              <Text dimColor>   Usuário: {destConfig.user}</Text>
            )}
            <Text dimColor>   SSL: {destConfig?.ssl ? 'Sim' : 'Não'}</Text>
          </Box>

          <Text> </Text>
          <Text>Dê um nome para salvar esta configuração:</Text>
          <Box gap={1} marginTop={1}>
            <Text dimColor>Nome: </Text>
            <TextInput
              value={connectionName}
              onChange={setConnectionName}
              onSubmit={handleSaveConnectionSubmit}
              placeholder="Ex: Produção ES5 → ES9"
            />
          </Box>
        </Box>

        <Box flexDirection="column">
          <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
          <Box paddingX={2}>
            <Text>
              {yellow('Enter')}<Text dimColor> salvar e continuar</Text>
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (step === 'select-indices') {
    return (
      <MultiIndexSelector
        indices={indices.map(idx => idx.name)}
        onLoadFields={handleLoadFields}
        onConfirm={handleConfirmMigrations}
        onCancel={onCancel}
      />
    );
  }

  return null;
}
