import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import config from '../../utils/config.js';

const CONFIG_PATH = path.join(config.app.dir, 'ai-config.json');

const PROVIDERS = ['claude', 'openai', 'gemini', 'custom'];

const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-1.5-pro',
  custom: '',
};

/**
 * Load AI provider configuration from ~/.migra-es/ai-config.json
 * @returns {object|null} AI config or null if not configured
 */
export function loadAIConfig() {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save AI provider configuration to ~/.migra-es/ai-config.json
 * @param {object} aiConfig
 * @param {string} aiConfig.provider  - 'claude' | 'openai' | 'gemini' | 'custom'
 * @param {string} aiConfig.model     - Model identifier
 * @param {string} aiConfig.apiKey    - API key
 * @param {string} [aiConfig.baseUrl] - Base URL (custom provider only)
 */
export function saveAIConfig(aiConfig) {
  mkdirSync(config.app.dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(aiConfig, null, 2), 'utf-8');
}

/**
 * Check if AI is configured
 * @returns {boolean}
 */
export function isAIConfigured() {
  const cfg = loadAIConfig();
  return !!(cfg?.provider && cfg?.apiKey);
}

export { PROVIDERS, DEFAULT_MODELS };
