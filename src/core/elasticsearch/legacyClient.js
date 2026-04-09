import https from 'https';
import http from 'http';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('LegacyElasticsearchClient');

/**
 * Legacy Elasticsearch client for ES5/ES6 compatibility
 * Uses direct HTTP requests instead of official client
 */
export class LegacyElasticsearchClient {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.url;
    this.auth = null;
    
    if (config.user && config.password) {
      this.auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');
    }

    // Determine if using HTTPS
    this.isHttps = this.baseUrl.startsWith('https');
    this.httpModule = this.isHttps ? https : http;

    // Agent for connection pooling
    const agentOptions = {
      keepAlive: true,
      maxSockets: 50
    };

    if (this.isHttps && !config.rejectUnauthorized) {
      agentOptions.rejectUnauthorized = false;
    }

    this.agent = this.isHttps 
      ? new https.Agent(agentOptions)
      : new http.Agent(agentOptions);

    logger.info('Legacy ES client created', { url: this.baseUrl });
  }

  /**
   * Make HTTP request to Elasticsearch
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {object} body - Request body
   * @returns {Promise<object>} Response data
   */
  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      
      const options = {
        method,
        hostname: url.hostname,
        port: url.port || (this.isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json'
        },
        agent: this.agent
      };

      if (this.auth) {
        options.headers['Authorization'] = `Basic ${this.auth}`;
      }

      if (body) {
        const bodyStr = JSON.stringify(body);
        options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }

      const req = this.httpModule.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${parsed.error?.reason || data}`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Get cluster info
   */
  async info() {
    return this.request('GET', '/');
  }

  /**
   * Get cluster health
   */
  async cluster() {
    return {
      health: async () => this.request('GET', '/_cluster/health')
    };
  }

  /**
   * Cat API
   */
  get cat() {
    return {
      indices: async (params = {}) => {
        const format = params.format || 'json';
        const h = params.h || 'index,docs.count,store.size,pri,rep,status,health';
        return this.request('GET', `/_cat/indices?format=${format}&h=${h}`);
      }
    };
  }

  /**
   * Indices API
   */
  get indices() {
    return {
      getMapping: async ({ index }) => {
        return this.request('GET', `/${index}/_mapping`);
      },
      
      getSettings: async ({ index }) => {
        return this.request('GET', `/${index}/_settings`);
      },
      
      exists: async ({ index }) => {
        try {
          await this.request('HEAD', `/${index}`);
          return true;
        } catch (err) {
          return false;
        }
      },
      
      create: async ({ index, body }) => {
        return this.request('PUT', `/${index}`, body);
      },
      
      delete: async ({ index }) => {
        return this.request('DELETE', `/${index}`);
      },
      
      refresh: async ({ index }) => {
        return this.request('POST', `/${index}/_refresh`);
      }
    };
  }

  /**
   * Count documents
   */
  async count({ index }) {
    return this.request('GET', `/${index}/_count`);
  }

  /**
   * Search API
   */
  async search({ index, scroll, size, body }) {
    const params = new URLSearchParams();
    if (scroll) params.append('scroll', scroll);
    if (size) params.append('size', size);
    
    const path = `/${index}/_search${params.toString() ? '?' + params.toString() : ''}`;
    return this.request('POST', path, body);
  }

  /**
   * Scroll API
   */
  async scroll({ scroll_id, scroll }) {
    return this.request('POST', '/_search/scroll', {
      scroll_id,
      scroll
    });
  }

  /**
   * Clear scroll
   */
  async clearScroll({ scroll_id }) {
    return this.request('DELETE', '/_search/scroll', {
      scroll_id
    });
  }

  /**
   * Bulk API
   */
  async bulk({ body, refresh, timeout }) {
    const params = new URLSearchParams();
    if (refresh !== undefined) params.append('refresh', refresh);
    if (timeout) params.append('timeout', timeout);
    
    const path = `/_bulk${params.toString() ? '?' + params.toString() : ''}`;
    
    // Build NDJSON format
    let ndjson = '';
    for (const item of body) {
      ndjson += JSON.stringify(item) + '\n';
    }
    
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      
      const options = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (this.isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Content-Length': Buffer.byteLength(ndjson)
        },
        agent: this.agent
      };

      if (this.auth) {
        options.headers['Authorization'] = `Basic ${this.auth}`;
      }

      const req = this.httpModule.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Failed to parse bulk response: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(ndjson);
      req.end();
    });
  }

  /**
   * Close client
   */
  async close() {
    this.agent.destroy();
    logger.info('Legacy ES client closed');
  }
}

/**
 * Create legacy Elasticsearch client
 * @param {object} config - Client configuration
 * @returns {LegacyElasticsearchClient} Client instance
 */
export function createLegacyElasticsearchClient(config) {
  return new LegacyElasticsearchClient(config);
}

export default {
  LegacyElasticsearchClient,
  createLegacyElasticsearchClient
};
