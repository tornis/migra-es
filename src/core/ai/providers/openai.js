import OpenAI from 'openai';

/**
 * OpenAI streaming provider.
 * @param {object} cfg  - { apiKey, model }
 */
export function createOpenAIProvider(cfg) {
  const client = new OpenAI({ apiKey: cfg.apiKey });

  return {
    async streamAnalysis(prompt, onChunk, onComplete, onError) {
      try {
        let full = '';
        const stream = await client.chat.completions.create({
          model:    cfg.model || 'gpt-4o',
          stream:   true,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? '';
          if (delta) {
            full += delta;
            onChunk(delta);
          }
        }

        onComplete(full);
      } catch (err) {
        onError(err);
      }
    },
  };
}
