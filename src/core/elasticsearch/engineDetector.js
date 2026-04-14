import { createLogger } from '../../utils/logger.js';

const logger = createLogger('EngineDetector');

// ── Constants ────────────────────────────────────────────────────────────────

export const ENGINE = {
  ELASTICSEARCH: 'elasticsearch',
  OPENSEARCH:    'opensearch',
};

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Detect the engine type and full version of an ES/OpenSearch cluster.
 *
 * Detection order:
 *   1. version.distribution === "opensearch"      (OpenSearch 1.x+ header)
 *   2. tagline contains "opensearch"              (all OpenSearch versions)
 *   3. version.build_flavor === "oss"             (some OS builds)
 *   4. Falls back to "elasticsearch"
 *
 * @param {{ url: string, user?: string, password?: string, ssl?: boolean, rejectUnauthorized?: boolean }} config
 * @returns {Promise<{
 *   engine: 'elasticsearch'|'opensearch',
 *   version: string,
 *   major: number,
 *   minor: number,
 *   patch: number,
 *   versionFull: string,
 *   clusterName: string,
 * }>}
 */
export async function detectEngine(config) {
  try {
    const baseUrl = config.url.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

    if (config.user && config.password) {
      const b64 = Buffer.from(`${config.user}:${config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${b64}`;
    }

    // Node.js 18+ native fetch — disable TLS verify via dispatcher if needed
    let fetchInit = { method: 'GET', headers };

    if (config.ssl && config.rejectUnauthorized === false) {
      try {
        const { Agent } = await import('undici');
        fetchInit = {
          ...fetchInit,
          dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
        };
      } catch {
        // undici not available — proceed without TLS override
      }
    }

    const res  = await fetch(baseUrl, fetchInit);
    const data = await res.json();

    const versionStr  = String(data?.version?.number ?? '0.0.0');
    const [maj, min, pat] = versionStr.split('.').map(n => parseInt(n, 10) || 0);
    const tagline     = String(data?.tagline ?? '').toLowerCase();
    const distribution = String(data?.version?.distribution ?? '').toLowerCase();
    const buildFlavor  = String(data?.version?.build_flavor ?? '').toLowerCase();
    const clusterName  = String(data?.cluster_name ?? data?.name ?? 'unknown');

    const isOpenSearch =
      distribution === 'opensearch' ||
      tagline.includes('opensearch') ||
      buildFlavor === 'oss';

    const engine = isOpenSearch ? ENGINE.OPENSEARCH : ENGINE.ELASTICSEARCH;

    logger.info('Engine detected', { engine, version: versionStr, cluster: clusterName, url: config.url });

    return {
      engine,
      version:     versionStr,
      major:       maj,
      minor:       min,
      patch:       pat,
      versionFull: versionStr,
      clusterName,
    };
  } catch (err) {
    logger.warn('Engine detection failed — defaulting to elasticsearch', {
      url:   config.url,
      error: err.message,
    });
    return {
      engine:      ENGINE.ELASTICSEARCH,
      version:     '5.0.0',
      major:       5,
      minor:       0,
      patch:       0,
      versionFull: '5.0.0',
      clusterName: 'unknown',
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Short tag used in cache keys.
 * @param {'elasticsearch'|'opensearch'} engine
 * @returns {'ES'|'OS'}
 */
export function engineTag(engine) {
  return engine === ENGINE.OPENSEARCH ? 'OS' : 'ES';
}

/**
 * Human-readable engine name.
 * @param {'elasticsearch'|'opensearch'} engine
 * @returns {string}
 */
export function engineName(engine) {
  return engine === ENGINE.OPENSEARCH ? 'OpenSearch' : 'Elasticsearch';
}

/**
 * Format engine + version label for display.
 * @param {'elasticsearch'|'opensearch'} engine
 * @param {string} version
 * @returns {string}  e.g. "Elasticsearch 8.12.0"
 */
export function formatEngineLabel(engine, version) {
  return `${engineName(engine)} ${version}`;
}

/**
 * True when src and dest engines differ.
 * @param {'elasticsearch'|'opensearch'} srcEngine
 * @param {'elasticsearch'|'opensearch'} destEngine
 * @returns {boolean}
 */
export function isCrossSolution(srcEngine, destEngine) {
  return srcEngine !== destEngine;
}
