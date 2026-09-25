// The one place that talks to Claude. Every call asks for JSON that matches a
// schema (structured outputs), so the article pipeline never has to dig an
// object out of prose.
//
// Refusals: Claude Opus 5's safety classifiers can decline a request, which
// arrives as a normal response with stop_reason "refusal". Parliamentary
// debates touch defence, extremism and security policy often enough that this
// is worth planning for, so every request opts into server-side fallbacks
// (`fallbacks: "default"`): a declined request is re-run on the model Anthropic
// recommends for that case, inside the same call.

import Anthropic from '@anthropic-ai/sdk';

export class ClaudeError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.name = 'ClaudeError';
    this.retryable = retryable;
  }
}

function explain(err) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ClaudeError('Der Anthropic-API-Key wurde abgelehnt (ANTHROPIC_API_KEY prüfen).');
  }
  if (err instanceof Anthropic.RateLimitError) return new ClaudeError('Anthropic-Ratenlimit erreicht.', { retryable: true });
  if (err instanceof Anthropic.BadRequestError) return new ClaudeError(`Anthropic lehnte die Anfrage ab: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError) return new ClaudeError('Anthropic nicht erreichbar.', { retryable: true });
  if (err instanceof Anthropic.APIError) return new ClaudeError(`Anthropic-Fehler ${err.status}: ${err.message}`, { retryable: true });
  return err;
}

export function createClaude({ apiKey, model, fetch }) {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 3, ...(fetch ? { fetch } : {}) });

  async function json({ system, prompt, schema, effort = 'high', maxTokens = 32000 }) {
    let message;
    try {
      // Streaming, because a large max_tokens on a non-streaming request can
      // run into HTTP timeouts; finalMessage() gives the assembled response.
      const stream = client.beta.messages.stream({
        model,
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort, format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      message = await stream.finalMessage();
    } catch (err) {
      throw explain(err);
    }

    if (message.stop_reason === 'refusal') {
      throw new ClaudeError(`Claude hat die Anfrage abgelehnt (${message.stop_details?.category || 'ohne Kategorie'}).`);
    }
    if (message.stop_reason === 'max_tokens') {
      throw new ClaudeError('Die Antwort wurde am Token-Limit abgeschnitten.', { retryable: true });
    }
    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ClaudeError('Die Antwort war kein gültiges JSON.', { retryable: true });
    }
    return {
      data,
      model: message.model,
      usage: { input: message.usage?.input_tokens || 0, output: message.usage?.output_tokens || 0 },
    };
  }

  return { model, json };
}
