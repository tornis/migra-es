/**
 * Custom provider — OpenAI-compatible REST API (streaming).
 * @param {object} cfg  - { apiKey, model, baseUrl }
 */
export function createCustomProvider(cfg) {
  return {
    async streamAnalysis(prompt, onChunk, onComplete, onError) {
      try {
        const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model:    cfg.model,
            stream:   true,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const reader  = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let full = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta  = parsed.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                full += delta;
                onChunk(delta);
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }

        onComplete(full);
      } catch (err) {
        onError(err);
      }
    },
  };
}
