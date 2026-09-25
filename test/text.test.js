import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeHtml, html, paragraphs, raw } from '../src/html.js';
import { addDays, berlinDate, berlinHour, chunkPage, cleanPageText, formatDateDe, quoteIsIn, slugify, splitSentences, truncate } from '../src/text.js';

test('cleanPageText joins hyphenated line breaks and keeps real hyphens', () => {
  const raw = 'Wir wollen mehr Mieterin-\nnen schützen und die CDU-\nGeschäftsstelle   bleibt.­\n\n\n\nNeuer Absatz.';
  assert.equal(cleanPageText(raw), 'Wir wollen mehr Mieterinnen schützen und die CDU-Geschäftsstelle bleibt.\n\nNeuer Absatz.');
});

test('splitSentences does not cut after German abbreviations', () => {
  const s = splitSentences('Wir fordern z. B. mehr Geld. Das gilt u. a. für Schulen! Und Kitas? Ja.');
  assert.deepEqual(s, ['Wir fordern z. B. mehr Geld.', 'Das gilt u. a. für Schulen!', 'Und Kitas?', 'Ja.']);
});

test('chunkPage keeps passages near the target size and drops page furniture', () => {
  const para = 'Wir setzen uns für bezahlbares Wohnen ein und wollen die Mietpreisbremse verlängern. '.repeat(8).trim();
  const text = `${para}\n\n${para}\n\n${para}\n\n12`;
  const chunks = chunkPage(text, { target: 900, max: 1400 });
  assert.ok(chunks.length >= 2);
  for (const c of chunks) assert.ok(c.length <= 1400 * 1.2, `chunk too long: ${c.length}`);
  assert.ok(!chunks.includes('12'));
  assert.deepEqual(chunkPage('7\n\n– 8 –'), []);
});

test('chunkPage splits a single huge paragraph along sentences', () => {
  const sentence = 'Die Bundeswehr braucht eine verlässliche Finanzierung für die kommenden Jahre. ';
  const chunks = chunkPage(sentence.repeat(60), { target: 900, max: 1400 });
  assert.ok(chunks.length >= 3);
  for (const c of chunks) {
    assert.ok(c.length <= 1400 * 1.2);
    assert.ok(c.endsWith('.'), 'cut at a sentence end');
  }
});

test('quoteIsIn tolerates quotes, case and whitespace but not invented words', () => {
  const passage = 'Wir wollen die „Mietpreisbremse“ bis 2029 verlängern –\nund zwar bundesweit.';
  assert.ok(quoteIsIn('die Mietpreisbremse bis 2029 verlängern - und zwar', passage));
  assert.ok(quoteIsIn('Wir wollen die Mietpreisbremse … bundesweit.', passage));
  assert.ok(!quoteIsIn('die Mietpreisbremse abschaffen', passage));
  assert.ok(!quoteIsIn('Wir', passage), 'too short to count as a quote');
  assert.ok(!quoteIsIn('bundesweit … Wir wollen', passage), 'pieces must be in order');
});

test('slugify transliterates German', () => {
  assert.equal(slugify('Bündnis 90/Die Grünen – Wahlprogramm 2025'), 'buendnis-90-die-gruenen-wahlprogramm-2025');
  assert.equal(slugify('Straße & Größe'), 'strasse-groesse');
});

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
