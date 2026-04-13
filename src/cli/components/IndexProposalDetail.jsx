import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import { t } from '../../i18n/index.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);

const TABS = ['report', 'mapping', 'settings', 'strategy'];

function AnalysisLine({ line }) {
  if (line.startsWith('### 🔴') || line.startsWith('### Critical')) return <Text bold color="red">{line}</Text>;
  if (line.startsWith('### 🟡') || line.startsWith('### Warning'))  return <Text bold color="yellow">{line}</Text>;
  if (line.startsWith('### 🟢') || line.startsWith('### Summary'))  return <Text bold color="green">{line}</Text>;
  if (line.startsWith('### '))  return <Text bold color="white">{line}</Text>;
  if (line.startsWith('## '))   return <Text bold color="white">{line}</Text>;
  if (line.startsWith('- '))    return <Text><Text color="yellow">  • </Text><Text>{line.slice(2)}</Text></Text>;
  if (/^\d+\./.test(line))      return <Text><Text color="cyan">  {line.match(/^\d+/)[0]}. </Text><Text>{line.replace(/^\d+\.\s*/, '')}</Text></Text>;
  if (line === '')               return <Text> </Text>;
  return <Text dimColor={line.startsWith('  ')}>{line}</Text>;
}

function JsonBlock({ obj, maxLines }) {
  if (!obj) return <Text dimColor>(empty)</Text>;
  const lines = JSON.stringify(obj, null, 2).split('\n').slice(0, maxLines ?? 999);
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <Text key={i} dimColor={l.trim().startsWith('"') && l.includes(':')}>
          {l.startsWith('  "')   ? <Text color="cyan">{l}</Text>     :
           l.startsWith('  }')   ? <Text dimColor>{l}</Text>         :
           l.includes('": "')    ? <Text><Text color="cyan">{l.split('": "')[0]}":</Text><Text color="green"> "{l.split('": "')[1]}</Text></Text> :
           <Text>{l}</Text>}
        </Text>
      ))}
    </Box>
  );
}

/**
 * Full detail view for one index proposal — navigable tabs.
 *
 * @param {object}   props
 * @param {object}   props.proposal  - Full proposal object
 * @param {Function} props.onBack
 */
export default function IndexProposalDetail({ proposal, onBack }) {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows    ?? 24;

  const [tab,    setTab]    = useState(0);
  const [scroll, setScroll] = useState(0);

  const contentRows = Math.max(6, rows - 10);

  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') { onBack(); return; }

    if (key.leftArrow)  { setTab(t => Math.max(0, t - 1)); setScroll(0); }
    if (key.rightArrow) { setTab(t => Math.min(TABS.length - 1, t + 1)); setScroll(0); }
    if (key.upArrow)    setScroll(s => Math.max(0, s - 1));
    if (key.downArrow)  setScroll(s => s + 1);
  });

  const DECISION_COLOR = {
    MIGRATE_DIRECTLY:   'green',
    REINDEX_REQUIRED:   'yellow',
    MANUAL_ADJUSTMENTS: 'red',
  };

  const dec = proposal?.decision;

  // Content per tab
  const tabContent = () => {
    switch (TABS[tab]) {
      case 'report': {
        const lines = (proposal?.impactReport ?? '').split('\n');
        return lines.slice(scroll, scroll + contentRows).map((l, i) => (
          <AnalysisLine key={i} line={l} />
        ));
      }
      case 'mapping': {
        const lines = JSON.stringify(proposal?.proposedMapping ?? {}, null, 2).split('\n');
        return lines.slice(scroll, scroll + contentRows).map((l, i) => (
          <Text key={i}><Text>{l}</Text></Text>
        ));
      }
      case 'settings': {
        const combined = {
          settings: proposal?.proposedSettings ?? {},
          ...(proposal?.proposedAnalyzers && Object.keys(proposal.proposedAnalyzers).length > 0
            ? { analyzers: proposal.proposedAnalyzers }
            : {}),
          ...(proposal?.proposedAliases?.length > 0
            ? { aliases: proposal.proposedAliases }
            : {}),
          ...(proposal?.proposedTemplate
            ? { template: proposal.proposedTemplate }
            : {}),
        };
        const lines = JSON.stringify(combined, null, 2).split('\n');
        return lines.slice(scroll, scroll + contentRows).map((l, i) => (
          <Text key={i}>{l}</Text>
        ));
      }
      case 'strategy': {
        const lines = [
          ...(proposal?.migrationStrategy ?? '').split('\n'),
          '',
          '## Steps',
          ...(proposal?.migrationSteps ?? []).map((s, i) => `${i + 1}. ${s}`),
          '',
          '## Critical Issues',
          ...(proposal?.criticalIssues ?? []).map(s => `- ${s}`),
          '',
          '## Warnings',
          ...(proposal?.warnings ?? []).map(s => `- ${s}`),
        ];
        return lines.slice(scroll, scroll + contentRows).map((l, i) => (
          <AnalysisLine key={i} line={l} />
        ));
      }
      default: return null;
    }
  };

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader />

      {/* Index name + decision badge */}
      <Box paddingX={2} gap={2}>
        <Text bold color="white">{proposal?.indexName}</Text>
        {dec && (
          <Text bold color={DECISION_COLOR[dec] ?? undefined}>
            [{dec.replace(/_/g, ' ')}]
          </Text>
        )}
        {proposal?.srcVersion && (
          <Text dimColor>ES {proposal.srcVersion} → ES {proposal.destVersion}</Text>
        )}
      </Box>

      {/* Tab bar */}
      <Box paddingX={2} gap={1} marginTop={0}>
        {TABS.map((name, i) => (
          <Box key={name} paddingX={1}
            borderStyle={i === tab ? 'single' : undefined}
            borderColor={i === tab ? 'yellow' : undefined}
          >
            <Text bold={i === tab} color={i === tab ? 'yellow' : undefined}>
              {t(`proposal.tab_${name}`)}
            </Text>
          </Box>
        ))}
      </Box>

      <Text color="yellow" dimColor paddingX={2}>{'─'.repeat(width - 4)}</Text>

      {/* Content */}
      <Box flexDirection="column" paddingX={2} flexGrow={1} overflow="hidden">
        {tabContent()}
      </Box>

      {/* Command bar */}
      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2} gap={2}>
          <Text>{yellow('← →')}<Text dimColor> {t('proposal.key_tabs')}</Text></Text>
          <Text>{yellow('↑↓')}<Text dimColor>{t('keys.navigate')}</Text></Text>
          <Text>{yellow('Q')}<Text dimColor>{t('keys.back')}</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
