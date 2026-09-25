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

test('web search is limited to the given domains and survives a paused turn', async () => {
  const replies = [
    {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'pause_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [
        { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'SPD Regierungsprogramm 2025 pdf' } },
        { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://www.spd.de/a.pdf', title: 'A', encrypted_content: 'x', page_age: null }] },
      ],
    },
    {
      id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 6 },
      content: [
        { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_2', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
        { type: 'text', text: 'Die Langfassung: https://www.spd.de/b.pdf.' },
      ],
    },
  ];
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(replies[requests.length - 1]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const claude = createClaude({ apiKey: 'k', model: 'claude-opus-5', fetch });
  const urls = await claude.findUrls({ prompt: 'Finde das PDF', domains: ['spd.de'] });

  assert.deepEqual(urls, ['https://www.spd.de/b.pdf', 'https://www.spd.de/a.pdf'], 'named URL first, trailing punctuation removed');
  assert.equal(requests.length, 2, 'the paused turn was resumed');
  const [first, second] = requests;
  assert.deepEqual(first.body.tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4, allowed_domains: ['spd.de'] }]);
  assert.equal(first.body.fallbacks, 'default');
  assert.match(first.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(second.body.messages.length, 2);
  assert.equal(second.body.messages[1].role, 'assistant', 'the paused assistant turn is sent back unchanged');
  assert.equal(second.body.messages[1].content[1].type, 'web_search_tool_result');
});
