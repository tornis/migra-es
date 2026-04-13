import { loadAIConfig } from './aiConfig.js';
import { createClaudeProvider } from './providers/claude.js';
import { createOpenAIProvider }  from './providers/openai.js';
import { createGeminiProvider }  from './providers/gemini.js';
import { createCustomProvider }  from './providers/custom.js';

/**
 * Instantiate the configured AI provider.
 * Throws if AI is not configured or the provider is unknown.
 * @param {object} [overrideCfg] - Override the persisted config (used in setup wizard)
 * @returns {{ streamAnalysis(prompt, onChunk, onComplete, onError): Promise<void> }}
 */
export function createAIClient(overrideCfg) {
  const cfg = overrideCfg ?? loadAIConfig();

  if (!cfg?.provider || !cfg?.apiKey) {
    throw new Error('AI provider not configured. Set provider and API key first.');
  }

  switch (cfg.provider) {
    case 'claude': return createClaudeProvider(cfg);
    case 'openai': return createOpenAIProvider(cfg);
    case 'gemini': return createGeminiProvider(cfg);
    case 'custom': return createCustomProvider(cfg);
    default:
      throw new Error(`Unknown AI provider: "${cfg.provider}"`);
  }
}
