import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Google Gemini streaming provider.
 * @param {object} cfg  - { apiKey, model }
 */
export function createGeminiProvider(cfg) {
  const genAI = new GoogleGenerativeAI(cfg.apiKey);

  return {
    async streamAnalysis(prompt, onChunk, onComplete, onError) {
      try {
        const model  = genAI.getGenerativeModel({ model: cfg.model || 'gemini-1.5-pro' });
        const result = await model.generateContentStream(prompt);

        let full = '';
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            full += text;
            onChunk(text);
          }
        }

        onComplete(full);
      } catch (err) {
        onError(err);
      }
    },
  };
}
