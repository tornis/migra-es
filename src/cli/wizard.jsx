import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import ConnectionForm from './components/ConnectionForm.jsx';
import IndexSelector from './components/IndexSelector.jsx';
import IndexInput from './components/IndexInput.jsx';
import FieldSelector from './components/FieldSelector.jsx';
import { createElasticsearchClient, testConnection } from '../core/elasticsearch/client.js';
import { listIndices, getIndexMapping } from '../core/elasticsearch/indexManager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Wizard');

/**
 * Migration wizard component
 * @param {object} props - Component props
 * @param {Function} props.onComplete - Completion callback
 * @param {Function} props.onCancel - Cancel callback
 */
export default function MigrationWizard({ onComplete, onCancel }) {
  const [step, setStep] = useState('source');
  const [sourceConfig, setSourceConfig] = useState(null);
  const [destConfig, setDestConfig] = useState(null);
  const [indices, setIndices] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
    
    // Q também cancela o wizard
    if (input === 'q' || input === 'Q') {
      onCancel();
    }
  });

  const handleSourceSubmit = async (config) => {
    setLoading(true);
    setError(null);

    try {
      logger.info('Testing source connection', { url: config.url });
      const client = await createElasticsearchClient(config);
      const result = await testConnection(client);
      
      if (result.success) {
        setSourceConfig(config);
        setStep('destination');
        logger.info('Source connection successful', { version: result.version });
      } else {
        setError(`Falha na conexão: ${result.error}`);
      }
      
      await client.close();
    } catch (err) {
      logger.error('Source connection failed', { error: err.message });
      setError(`Erro ao conectar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDestSubmit = async (config) => {
    setLoading(true);
    setError(null);

    try {
      logger.info('Testing destination connection', { url: config.url });
      const client = await createElasticsearchClient(config);
      const result = await testConnection(client);
      
      if (result.success) {
        setDestConfig(config);
        setStep('loading-indices');
        logger.info('Destination connection successful', { version: result.version });
        
        // Load indices from source
        await loadIndices();
      } else {
        setError(`Falha na conexão: ${result.error}`);
      }
      
      await client.close();
    } catch (err) {
      logger.error('Destination connection failed', { error: err.message });
      setError(`Erro ao conectar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadIndices = async () => {
    try {
      logger.info('Loading indices from source');
      const client = await createElasticsearchClient(sourceConfig);
      const indexList = await listIndices(client);
      setIndices(indexList);
      setStep('select-index');
      await client.close();
    } catch (err) {
      logger.error('Failed to load indices', { error: err.message });
      setError(`Erro ao carregar índices: ${err.message}`);
    }
  };

  const handleIndexSelect = async (indexName) => {
    setSelectedIndex({ name: indexName });
    setLoading(true);
    setError(null);

    try {
      logger.info('Loading index mapping', { index: indexName });
      const client = await createElasticsearchClient(sourceConfig);
      const indexMapping = await getIndexMapping(client, indexName);
      
      // Log mapping structure for debugging
      logger.debug('Index mapping structure', { 
        mapping: JSON.stringify(indexMapping, null, 2).substring(0, 500) 
      });
      
      setMapping(indexMapping);
      setStep('select-field');
      await client.close();
    } catch (err) {
      logger.error('Failed to load mapping', { error: err.message });
      setError(`Erro ao carregar mapping: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldSelect = (fieldName) => {
    if (fieldName === null) {
      logger.warn('Migration without control field selected', { index: selectedIndex.name });
    } else {
      logger.info('Field selected', { field: fieldName });
    }
    
    const migrationConfig = {
      name: `Migration: ${selectedIndex.name}`,
      sourceConfig,
      destConfig,
      indexName: selectedIndex.name,
      controlField: fieldName // Can be null
    };

    onComplete(migrationConfig);
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Processando...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Erro: {error}</Text>
        <Text> </Text>
        <Text dimColor>Pressione ESC para voltar</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {step === 'source' && (
        <ConnectionForm
          title="Configuração do Elasticsearch de Origem"
          onSubmit={handleSourceSubmit}
          onCancel={onCancel}
        />
      )}

      {step === 'destination' && (
        <ConnectionForm
          title="Configuração do Elasticsearch de Destino"
          onSubmit={handleDestSubmit}
          onCancel={onCancel}
        />
      )}

      {step === 'loading-indices' && (
        <Box padding={1}>
          <Text>Carregando índices...</Text>
        </Box>
      )}

      {step === 'select-index' && (
        <IndexSelector
          indices={indices.map(idx => idx.name)}
          onSelect={handleIndexSelect}
          onCancel={onCancel}
        />
      )}

      {step === 'select-field' && (
        <FieldSelector
          mapping={mapping}
          onSelect={handleFieldSelect}
          onCancel={onCancel}
        />
      )}
    </Box>
  );
}
