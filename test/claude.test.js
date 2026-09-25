import assert from 'node:assert/strict';
import test from 'node:test';

import { createClaude } from '../src/claude.js';

// A streamed Messages API response, as server-sent events.
function sse(text, stopReason = 'end_turn', extra = {}) {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 120, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null, ...extra }, usage: { output_tokens: 42 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

function recorder(body) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  return { requests, fetch };
}

const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };

test('requests structured JSON with adaptive thinking and server-side fallbacks', async () => {
  const { requests, fetch } = recorder(sse('{"ok":true}'));
  const claude = createClaude({ apiKey: 'test-key', model: 'claude-opus-5', fetch });
  const res = await claude.json({ system: 'System', prompt: 'Frage', schema, effort: 'low', maxTokens: 1000 });

  assert.deepEqual(res.data, { ok: true });
  assert.deepEqual(res.usage, { input: 120, output: 42 });
  const [req] = requests;
  assert.match(req.url, /\/v1\/messages/);
  assert.match(req.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(req.headers.get('x-api-key'), 'test-key');
  assert.equal(req.body.model, 'claude-opus-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.equal(req.body.stream, true);
  assert.deepEqual(req.body.thinking, { type: 'adaptive' });
  assert.deepEqual(req.body.output_config, { effort: 'low', format: { type: 'json_schema', schema } });
  assert.equal(req.body.max_tokens, 1000);
  assert.equal(req.body.betas, undefined, 'betas travel as a header, not in the body');
  assert.deepEqual(req.body.messages, [{ role: 'user', content: 'Frage' }]);
});

test('refusals and truncation become errors instead of half articles', async () => {
  const refused = createClaude({ apiKey: 'k', model: 'claude-opus-5', fetch: recorder(sse('', 'refusal')).fetch });
  await assert.rejects(refused.json({ system: 's', prompt: 'p', schema }), /abgelehnt/);

  const cut = createClaude({ apiKey: 'k', model: 'claude-opus-5', fetch: recorder(sse('{"ok":', 'max_tokens')).fetch });
  await assert.rejects(cut.json({ system: 's', prompt: 'p', schema }), (err) => err.retryable && /Token-Limit/.test(err.message));
});

test('no key, no client', () => {
  assert.equal(createClaude({ apiKey: '', model: 'claude-opus-5' }), null);
});
