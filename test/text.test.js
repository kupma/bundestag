import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeHtml, html, paragraphs, raw } from '../src/html.js';
import { addDays, berlinDate, berlinHour, formatDateDe, truncate } from '../src/text.js';

test('Berlin dates and German formatting', () => {
  // 23:30 UTC on 30 June is already 1 July in Berlin (summer time).
  assert.equal(berlinDate(new Date('2026-06-30T23:30:00Z')), '2026-07-01');
  assert.equal(berlinHour(new Date('2026-01-15T05:30:00Z')), 6);
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(formatDateDe('2026-09-24'), 'Donnerstag, 24. September 2026');
  assert.equal(formatDateDe('2026-09-24', { weekday: false }), '24. September 2026');
});

test('truncate cuts at a word', () => {
  assert.equal(truncate('eins zwei drei vier', 12), 'eins zwei …');
  assert.equal(truncate('kurz', 12), 'kurz');
});

test('html escapes interpolations unless marked safe', () => {
  const name = '<script>alert(1)</script>';
  assert.equal(String(html`<p>${name}</p>`), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(String(html`<p>${raw('<b>ok</b>')}</p>`), '<p><b>ok</b></p>');
  assert.equal(String(html`<ul>${['a', '<b>'].map((x) => html`<li>${x}</li>`)}</ul>`), '<ul><li>a</li><li>&lt;b&gt;</li></ul>');
  assert.equal(String(paragraphs('eins\nzwei\n\n<drei>')), '<p>eins<br>zwei</p><p>&lt;drei&gt;</p>');
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
});
