import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude (Anthropic) streaming provider.
 * @param {object} cfg  - { apiKey, model }
 */
export function createClaudeProvider(cfg) {
  const client = new Anthropic({ apiKey: cfg.apiKey });

  return {
    /**
     * Stream a completion for the given prompt.
     * @param {string}   prompt
     * @param {Function} onChunk    - Called with each text delta string
     * @param {Function} onComplete - Called with the full response text
     * @param {Function} onError    - Called with an Error object on failure
     */
    async streamAnalysis(prompt, onChunk, onComplete, onError) {
      try {
        let full = '';
        const stream = await client.messages.stream({
          model:      cfg.model || 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages:   [{ role: 'user', content: prompt }],
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta?.type === 'text_delta'
          ) {
            const chunk = event.delta.text;
            full += chunk;
            onChunk(chunk);
          }
        }

        onComplete(full);
      } catch (err) {
        onError(err);
      }
    },
  };
}
