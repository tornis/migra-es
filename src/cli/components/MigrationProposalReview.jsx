import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import gradient from 'gradient-string';
import AppHeader from './AppHeader.jsx';
import IndexProposalDetail from './IndexProposalDetail.jsx';
import { getIndexArtifactsDir } from '../../core/ai/indexArtifacts.js';
import { t } from '../../i18n/index.js';

const yellow = gradient(['#FFD700', '#FFA500', '#FFEC00', '#FFD700']);
const green  = gradient(['#34a853', '#0f9d58']);
const red    = gradient(['#ea4335', '#c5221f']);
const amber  = gradient(['#B8860B', '#DAA520']);

const DECISION_COLOR = {
  MIGRATE_DIRECTLY:   'green',
  REINDEX_REQUIRED:   'yellow',
  MANUAL_ADJUSTMENTS: 'red',
};

const DECISION_BADGE = {
  MIGRATE_DIRECTLY:   '✓ MIGRATE DIRECTLY',
  REINDEX_REQUIRED:   '↻ REINDEX REQUIRED',
  MANUAL_ADJUSTMENTS: '⚠ MANUAL ADJUSTMENTS',
};

/**
 * Review screen: list of all analyzed indices with approve/reject toggle.
 *
 * @param {object}   props
 * @param {Array}    props.results        - [{indexName, controlField, proposal, status}]
 * @param {Function} props.onConfirm      - Called with approved [{indexName, controlField, proposal}]
 * @param {Function} props.onCancel
 */
export default function MigrationProposalReview({ results, onConfirm, onCancel }) {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const rows  = stdout?.rows    ?? 24;

  // Approved by default if analysis succeeded; skipped/error items start rejected
  const [approved, setApproved] = useState(() =>
    new Set(results.filter(r => r.proposal && r.status !== 'error').map(r => r.indexName))
  );
  const [cursor,     setCursor]     = useState(0);
  const [detailItem, setDetailItem] = useState(null);

  const toggleApproval = (indexName) => {
    setApproved(prev => {
      const next = new Set(prev);
      if (next.has(indexName)) next.delete(indexName);
      else next.add(indexName);
      return next;
    });
  };

  const handleConfirm = () => {
    const confirmed = results
      .filter(r => approved.has(r.indexName) && r.proposal)
      .map(r => ({
        indexName:    r.indexName,
        controlField: r.controlField,
        proposal:     r.proposal,
      }));
    onConfirm(confirmed);
  };

  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') { onCancel(); return; }

    if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(results.length - 1, c + 1));

    if (input === ' ') {
      const item = results[cursor];
      if (item?.proposal) toggleApproval(item.indexName);
    }

    if (key.return) {
      const item = results[cursor];
      if (item?.proposal) setDetailItem(item);
    }

    if ((input === 's' || input === 'S') && approved.size > 0) {
      handleConfirm();
    }
  });

  // ── Show detail for selected index ────────────────────────────────────────

  if (detailItem) {
    return (
      <IndexProposalDetail
        proposal={detailItem.proposal}
        onBack={() => setDetailItem(null)}
      />
    );
  }

  const approvedCount  = approved.size;
  const rejectedCount  = results.length - approvedCount;

  return (
    <Box flexDirection="column" minHeight={rows}>
      <AppHeader />

      <Box paddingX={2} gap={2}>
        <Text bold color="yellow">{t('proposal.review_title')}</Text>
        <Text color="green">{approvedCount} {t('proposal.approved')}</Text>
        {rejectedCount > 0 && (
          <Text color="red">{rejectedCount} {t('proposal.rejected')}</Text>
        )}
      </Box>
      <Text dimColor paddingX={2}>{t('proposal.review_hint')}</Text>

      <Text color="yellow" dimColor paddingX={2}>{'─'.repeat(width - 4)}</Text>

      <Box flexDirection="column" paddingX={2} flexGrow={1}>
        {results.map((item, i) => {
          const isApproved = approved.has(item.indexName);
          const focused    = i === cursor;
          const dec        = item.proposal?.decision;
          const hasError   = item.status === 'error';
          const critCount  = item.proposal?.criticalIssues?.length ?? 0;
          const warnCount  = item.proposal?.warnings?.length ?? 0;
          const artifDir   = getIndexArtifactsDir(item.indexName);

          return (
            <Box key={item.indexName} flexDirection="column" marginBottom={1}>
              <Box gap={1}>
                {focused ? <Text color="yellow" bold>▶ </Text> : <Text>  </Text>}

                {/* Approve checkbox */}
                {hasError
                  ? <Text color="red">[✗]</Text>
                  : <Text color={isApproved ? 'green' : 'red'}>
                      {isApproved ? '[✓]' : '[ ]'}
                    </Text>
                }

                {/* Index name */}
                <Text bold={focused} color={focused ? 'white' : undefined}>
                  {item.indexName}
                </Text>

                {/* Decision badge */}
                {dec && (
                  <Text color={DECISION_COLOR[dec] ?? undefined}>
                    {DECISION_BADGE[dec] ?? dec}
                  </Text>
                )}

                {hasError && (
                  <Text color="red">{t('proposal.analysis_failed')}</Text>
                )}
              </Box>

              {/* Issues summary */}
              {!hasError && (critCount > 0 || warnCount > 0) && (
                <Box marginLeft={8} gap={2}>
                  {critCount > 0 && (
                    <Text color="red" dimColor>
                      ✗ {critCount} {t('proposal.critical')}
                    </Text>
                  )}
                  {warnCount > 0 && (
                    <Text color="yellow" dimColor>
                      ⚠ {warnCount} {t('proposal.warnings')}
                    </Text>
                  )}
                  <Text dimColor>{artifDir}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Command bar */}
      <Box flexDirection="column">
        <Text color="yellow" dimColor>{'─'.repeat(width)}</Text>
        <Box paddingX={2} gap={2} flexWrap="wrap">
          <Text>{yellow('↑↓')}<Text dimColor>{t('keys.navigate')}</Text></Text>
          <Text>{yellow('Space')}<Text dimColor> {t('proposal.key_toggle')}</Text></Text>
          {results[cursor]?.proposal && (
            <Text>{yellow('Enter')}<Text dimColor> {t('proposal.key_detail')}</Text></Text>
          )}
          {approvedCount > 0 && (
            <Text>{yellow('S')}<Text dimColor> {t('proposal.key_start', { count: approvedCount })}</Text></Text>
          )}
          <Text>{yellow('Q')}<Text dimColor>{t('keys.back')}</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
