import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import { analyzeImpact } from '../../core/ai/impactAnalyzer.js';
import { createElasticsearchClient } from '../../core/elasticsearch/client.js';
import { getIndexMapping, getIndexSettings } from '../../core/elasticsearch/indexManager.js';
import { t } from '../../i18n/index.js';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import config from '../../utils/config.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const green  = gradient(['#34a853', '#0f9d58']);
const red    = gradient(['#ea4335', '#c5221f']);

// ── Simple markdown-aware renderer ───────────────────────────────────────────

function AnalysisLine({ line }) {
  if (line.startsWith('### 🔴')) return <Text bold color="red">{line}</Text>;
  if (line.startsWith('### 🟡')) return <Text bold color="yellow">{line}</Text>;
  if (line.startsWith('### 🟢')) return <Text bold color="green">{line}</Text>;
  if (line.startsWith('### 📋')) return <Text bold color="cyan">{line}</Text>;
  if (line.startsWith('### '))   return <Text bold color="white">{line}</Text>;
  if (line.startsWith('## '))    return <Text bold color="white">{line}</Text>;
  if (line.startsWith('**MIGRATE DIRECTLY**'))    return <Text bold color="green">{line}</Text>;
  if (line.startsWith('**REINDEX REQUIRED**'))    return <Text bold color="red">{line}</Text>;
  if (line.startsWith('**MANUAL ADJUSTMENTS'))    return <Text bold color="yellow">{line}</Text>;
  if (line.startsWith('- '))    return <Text><Text color="yellow">  • </Text><Text>{line.slice(2)}</Text></Text>;
  if (line.startsWith('  - '))  return <Text><Text color="yellow">    ◦ </Text><Text>{line.slice(4)}</Text></Text>;
  if (/^\d+\./.test(line))      return <Text><Text color="cyan">  {line.match(/^\d+/)[0]}. </Text><Text>{line.replace(/^\d+\.\s*/, '')}</Text></Text>;
  if (line === '')               return <Text> </Text>;
  return <Text dimColor={line.startsWith('  ')}>{line}</Text>;
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {object}   props.task        - Task object with indexName, sourceConfig, destConfig
 * @param {object}   [props.sourceConfig] - ES source config (overrides task.sourceConfig)
 * @param {object}   [props.destConfig]   - ES dest config
 * @param {Function} props.onBack      - Called to return to previous screen
 */
export default function ImpactAnalysisView({ task, sourceConfig, destConfig, onBack }) {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows    ?? 24;

  const [phase,    setPhase]    = useState('loading');   // loading | streaming | done | error
  const [status,   setStatus]   = useState('');
  const [lines,    setLines]    = useState([]);
  const [saved,    setSaved]    = useState(false);
  const [saveMsg,  setSaveMsg]  = useState('');

  const fullTextRef = useRef('');
  const bufferRef   = useRef('');

  const indexName  = task?.indexName ?? task?.name ?? '(unknown)';
  const srcCfg     = sourceConfig ?? task?.sourceConfig ?? {};
  const dstCfg     = destConfig   ?? task?.destConfig   ?? {};

  // ── Save report ─────────────────────────────────────────────────────────────

  const saveReport = () => {
    if (saved || phase !== 'done') return;
    try {
      const dir = path.join(config.app.dir, 'reports');
      mkdirSync(dir, { recursive: true });
      const ts   = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `impact-${indexName}-${ts}.md`);
      writeFileSync(file, `# Impact Analysis: ${indexName}\n\n${fullTextRef.current}`, 'utf-8');
      setSaved(true);
      setSaveMsg(file);
    } catch (e) {
      setSaveMsg(`Error: ${e.message}`);
    }
  };

  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') { onBack(); return; }
    if ((input === 's' || input === 'S') && phase === 'done') { saveReport(); }
  });

  // ── Run analysis on mount ────────────────────────────────────────────────────

  useEffect(() => {
    runAnalysis();
  }, []);

  const appendChunk = (chunk) => {
    bufferRef.current += chunk;
    fullTextRef.current += chunk;

    // Split on newlines, keep last incomplete line as buffer
    const parts = bufferRef.current.split('\n');
    bufferRef.current = parts.pop();

    if (parts.length > 0) {
      setLines(prev => [...prev, ...parts]);
    }
  };

  const runAnalysis = async () => {
    try {
      setPhase('loading');
      setStatus(t('ai.status_connecting'));

      // Connect and get ES versions
      const srcClient  = await createElasticsearchClient(srcCfg);
      const destClient = await createElasticsearchClient(dstCfg);

      const srcInfo  = await srcClient.info();
      const destInfo = await destClient.info();

      const srcVersion  = parseInt(srcInfo.version?.number?.split('.')[0] ?? '5', 10);
      const destVersion = parseInt(destInfo.version?.number?.split('.')[0] ?? '9', 10);

      setStatus(t('ai.status_fetching_mapping', { index: indexName }));
      const [mapping, settings] = await Promise.all([
        getIndexMapping(srcClient, indexName),
        getIndexSettings(srcClient, indexName),
      ]);

      setPhase('streaming');

      await analyzeImpact({
        indexName,
        mapping,
        settings,
        srcVersion,
        destVersion,
        onStatus:   (msg) => setStatus(msg),
        onChunk:    (chunk) => appendChunk(chunk),
        onComplete: (full) => {
          // Flush remaining buffer
          if (bufferRef.current) {
            setLines(prev => [...prev, bufferRef.current]);
            bufferRef.current = '';
          }
          fullTextRef.current = full;
          setPhase('done');
        },
        onError: (err) => {
          setStatus(err.message);
          setPhase('error');
        },
      });

    } catch (err) {
      setStatus(err.message);
      setPhase('error');
    }
  };

  // ── Content area height (rows minus header, status bar, command bar) ─────────
  const contentRows = Math.max(6, rows - 8);
  const visibleLines = lines.slice(-contentRows);

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader />

      {/* Title bar */}
      <Box paddingX={2} gap={1}>
        <Text bold color="yellow">{t('ai.analysis_title')}</Text>
        <Text bold color="white">{indexName}</Text>
        {phase === 'streaming' && <Text color="yellow" dimColor> ⠋ {t('ai.analyzing')}</Text>}
        {phase === 'done'      && <Text color="green">  ✓ {t('ai.done')}</Text>}
        {phase === 'error'     && <Text color="red">    ✗ {t('ai.error')}</Text>}
      </Box>

      {/* Status line */}
      {(phase === 'loading' || phase === 'streaming') && (
        <Box paddingX={2}>
          <Text dimColor>{status}</Text>
        </Box>
      )}

      <Text color="yellow" dimColor paddingX={2}>{'─'.repeat(width - 4)}</Text>

      {/* Analysis content */}
      <Box flexDirection="column" paddingX={2} flexGrow={1} overflow="hidden">
        {phase === 'loading' && (
          <Text dimColor>{t('ai.status_connecting')}</Text>
        )}

        {(phase === 'streaming' || phase === 'done') && visibleLines.map((line, i) => (
          <AnalysisLine key={i} line={line} />
        ))}

        {phase === 'error' && (
          <Box flexDirection="column" gap={1}>
            <Text color="red" bold>{t('ai.error_title')}</Text>
            <Text color="red">{status}</Text>
          </Box>
        )}
      </Box>

      {/* Save confirmation */}
      {saved && saveMsg && (
        <Box paddingX={2}>
          <Text color="green">{t('ai.saved_to')} </Text>
          <Text color="green" dimColor>{saveMsg}</Text>
        </Box>
      )}

      {/* Command bar */}
      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2} gap={2}>
          {phase === 'done' && !saved && (
            <Text>{yellow('S')}<Text dimColor> {t('ai.save_report')}</Text></Text>
          )}
          {phase === 'done' && saved && (
            <Text color="green">{t('ai.report_saved')}</Text>
          )}
          <Text>{yellow('Q')}<Text dimColor>{t('keys.back')}</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
