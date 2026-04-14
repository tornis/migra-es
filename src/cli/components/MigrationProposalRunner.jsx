import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import { generateMigrationProposal } from '../../core/ai/migrationProposal.js';
import { proposalExists, loadProposal, saveProposal } from '../../core/ai/indexArtifacts.js';
import { createElasticsearchClient } from '../../core/elasticsearch/client.js';
import { getIndexMapping, getIndexSettings } from '../../core/elasticsearch/indexManager.js';
import { formatEngineLabel, isCrossSolution } from '../../core/elasticsearch/engineDetector.js';
import { t } from '../../i18n/index.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const green  = gradient(['#34a853', '#0f9d58']);
const red    = gradient(['#ea4335', '#c5221f']);
const amber  = gradient(['#B8860B', '#DAA520']);

const DECISION_COLOR = {
  MIGRATE_DIRECTLY:    'green',
  REINDEX_REQUIRED:    'yellow',
  MANUAL_ADJUSTMENTS:  'red',
};

const STATUS_ICON = {
  pending:  '○',
  skipped:  '↩',
  running:  '⠋',
  done:     '✓',
  error:    '✗',
};

/**
 * Runs AI migration proposal analysis for each queued index sequentially.
 *
 * @param {object}   props
 * @param {Array}    props.queue         - [{indexName, controlField}]
 * @param {object}   props.sourceConfig
 * @param {object}   props.destConfig
 * @param {Function} props.onComplete    - Called with Array<{indexName, controlField, proposal, skipped}>
 * @param {Function} props.onCancel
 */
export default function MigrationProposalRunner({
  queue,
  sourceConfig,
  destConfig,
  onComplete,
  onCancel,
}) {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows    ?? 24;

  // Each entry: { indexName, controlField, status, proposal, error, reuseDecided }
  const [items, setItems] = useState(() =>
    queue.map(q => ({
      indexName:    q.indexName,
      controlField: q.controlField,
      status:       proposalExists(q.indexName) ? 'ask-reuse' : 'pending',
      proposal:     proposalExists(q.indexName) ? loadProposal(q.indexName) : null,
      error:        null,
      statusMsg:    '',
    }))
  );

  const [currentIdx, setCurrentIdx] = useState(null);
  const [reusePrompt, setReusePrompt] = useState(null); // index of item awaiting reuse decision
  const [phase, setPhase] = useState('running'); // running | done

  useInput((input, key) => {
    if (key.escape && phase !== 'running') { onCancel(); return; }

    // Handle reuse decision
    if (reusePrompt !== null) {
      if (input === 'y' || input === 'Y') {
        setItems(prev => {
          const next = [...prev];
          next[reusePrompt] = { ...next[reusePrompt], status: 'skipped', reuseDecided: true };
          return next;
        });
        setReusePrompt(null);
      }
      if (input === 'n' || input === 'N') {
        setItems(prev => {
          const next = [...prev];
          next[reusePrompt] = { ...next[reusePrompt], status: 'pending', proposal: null, reuseDecided: true };
          return next;
        });
        setReusePrompt(null);
      }
    }
  });

  // ── Orchestration ────────────────────────────────────────────────────────────

  useEffect(() => {
    runAll();
  }, []);

  const updateItem = (idx, patch) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const runAll = async () => {
    let srcClient  = null;
    let destClient = null;

    // Prefer pre-detected engine info from config (set by wizard after detectEngine())
    const srcEngine  = sourceConfig.engine        ?? 'elasticsearch';
    const destEngine = destConfig.engine          ?? 'elasticsearch';
    let srcVersion   = parseInt(sourceConfig.engineVersion?.split('.')[0] ?? '5', 10);
    let destVersion  = parseInt(destConfig.engineVersion?.split('.')[0]   ?? '9', 10);

    try {
      srcClient  = await createElasticsearchClient(sourceConfig);
      destClient = await createElasticsearchClient(destConfig);

      if (!sourceConfig.engineVersion || !destConfig.engineVersion) {
        const [srcInfo, destInfo] = await Promise.all([
          srcClient.info(),
          destClient.info(),
        ]);
        if (!sourceConfig.engineVersion) {
          srcVersion = parseInt(srcInfo.version?.number?.split('.')[0] ?? '5', 10);
        }
        if (!destConfig.engineVersion) {
          destVersion = parseInt(destInfo.version?.number?.split('.')[0] ?? '9', 10);
        }
      }
    } catch (e) {
      // Fall back to defaults if info() fails
    }

    // Wait for any pending reuse decisions before starting
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'ask-reuse') {
        setReusePrompt(i);
        // Wait until the user decides
        await waitForReuseDecision(i);
      }
    }

    // Process each item sequentially
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === 'skipped') continue;  // reuse decision was "yes"
      if (item.status !== 'pending') continue;

      setCurrentIdx(i);
      updateItem(i, { status: 'running', statusMsg: t('proposal.status_connecting') });

      try {
        const mapping  = await getIndexMapping(srcClient, item.indexName);
        const settings = await getIndexSettings(srcClient, item.indexName);

        await new Promise((resolve, reject) => {
          generateMigrationProposal({
            indexName:   item.indexName,
            mapping,
            settings,
            srcEngine,
            srcVersion,
            destEngine,
            destVersion,
            onStatus: (msg) => updateItem(i, { statusMsg: t(`proposal.status_${msg}`) ?? msg }),
            onComplete: (proposal) => {
              saveProposal(item.indexName, proposal);
              updateItem(i, { status: 'done', proposal, statusMsg: '' });
              resolve();
            },
            onError: (err) => {
              updateItem(i, { status: 'error', error: err.message, statusMsg: '' });
              resolve(); // continue with next
            },
          });
        });

      } catch (err) {
        updateItem(i, { status: 'error', error: err.message, statusMsg: '' });
      }
    }

    setCurrentIdx(null);
    setPhase('done');

    if (srcClient) await srcClient.close().catch(() => {});
    if (destClient) await destClient.close().catch(() => {});

    // Collect results
    setItems(current => {
      const results = current.map(item => ({
        indexName:    item.indexName,
        controlField: item.controlField,
        proposal:     item.proposal,
        status:       item.status,
      }));
      // Defer so state is flushed before calling parent
      setTimeout(() => onComplete(results), 50);
      return current;
    });
  };

  // Poll until a reuse decision is made (set externally via useInput)
  const waitForReuseDecision = (idx) =>
    new Promise(resolve => {
      const check = setInterval(() => {
        setItems(current => {
          if (current[idx].reuseDecided) {
            clearInterval(check);
            resolve();
          }
          return current;
        });
      }, 100);
    });

  // ── Render ────────────────────────────────────────────────────────────────────

  const done  = items.filter(i => ['done', 'skipped'].includes(i.status)).length;
  const total = items.length;

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader />

      <Box paddingX={2} gap={1} flexDirection="column">
        <Box gap={1}>
          <Text bold color="yellow">{t('proposal.runner_title')}</Text>
          <Text dimColor>({done}/{total})</Text>
        </Box>
        <Box gap={1}>
          <Text color="yellow" dimColor>{formatEngineLabel(srcEngine, sourceConfig.engineVersion ?? '')}</Text>
          <Text dimColor>→</Text>
          <Text color="green" dimColor>{formatEngineLabel(destEngine, destConfig.engineVersion ?? '')}</Text>
          {isCrossSolution(srcEngine, destEngine) && (
            <Text color="cyan" dimColor> ⚡ {t('wizard.cross_solution_label')}</Text>
          )}
        </Box>
      </Box>

      <Text color="yellow" dimColor paddingX={2}>{'─'.repeat(width - 4)}</Text>

      <Box flexDirection="column" paddingX={4} flexGrow={1} gap={0}>
        {items.map((item, i) => {
          const icon   = STATUS_ICON[item.status] ?? '○';
          const isCur  = i === currentIdx;
          const dec    = item.proposal?.decision;

          return (
            <Box key={item.indexName} flexDirection="column" marginBottom={0}>
              <Box gap={2}>
                <Text color={
                  item.status === 'done'    ? 'green' :
                  item.status === 'error'   ? 'red'   :
                  item.status === 'running' ? 'yellow' :
                  item.status === 'skipped' ? 'cyan'  : undefined
                }>{icon}</Text>
                <Text bold={isCur} color={isCur ? 'white' : undefined}>
                  {item.indexName}
                </Text>
                {dec && (
                  <Text color={DECISION_COLOR[dec] ?? undefined}>
                    [{dec.replace(/_/g, ' ')}]
                  </Text>
                )}
                {item.status === 'running' && item.statusMsg && (
                  <Text dimColor>{item.statusMsg}</Text>
                )}
                {item.status === 'error' && (
                  <Text color="red" dimColor>{item.error}</Text>
                )}
                {item.status === 'skipped' && (
                  <Text dimColor>{t('proposal.reused')}</Text>
                )}
              </Box>

              {/* Reuse prompt */}
              {reusePrompt === i && (
                <Box marginLeft={4} gap={1}>
                  <Text color="cyan">{t('proposal.reuse_question', { index: item.indexName })}</Text>
                  <Text>{yellow('Y')}<Text dimColor> {t('proposal.reuse_yes')}</Text></Text>
                  <Text>{yellow('N')}<Text dimColor> {t('proposal.reuse_no')}</Text></Text>
                </Box>
              )}
            </Box>
          );
        })}

        {phase === 'done' && (
          <Box marginTop={1}>
            <Text color="green">{t('proposal.runner_done', { count: done })}</Text>
          </Box>
        )}
      </Box>

      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2} gap={2}>
          {phase === 'running' && (
            <Text dimColor>{t('proposal.runner_wait')}</Text>
          )}
          {phase === 'done' && (
            <Text dimColor>{t('proposal.runner_proceed')}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
