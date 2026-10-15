import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRow } from '../src/agenda.js';
import { tick } from '../src/scheduler.js';
import { pendingSummaries, SUMMARY_MAX_CHARS, summaryPrompt, vorlagenOf, writeSummaries } from '../src/summaries.js';
import { berlinDate } from '../src/text.js';
import { browser, fakeClaude, fakeDip, fakeMailer, makeConfig, makeDb, startApp } from './helpers.js';

const row = (time, top, title, detail) => ({ time, top, topic: { title, detail }, status: { title: '', detail: '' } });

// One sitting day: a bill, a committee report on a motion next to a first
// reading, votes without debate, and a debate without any Drucksache.
const ROWS = [
  row('09:00', '8', 'Mietpreisbremse', 'Zweite und dritte Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zur Verlängerung der Mietpreisbremse<br/>Drucksache 21/1234<br/>Beschlussempfehlung und Bericht des Rechtsausschusses<br/>Drucksache 21/1300'),
  row('10:40', '9', 'Wehrdienst', 'a) Erste Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zur Modernisierung des Wehrdienstes<br/>Drucksache 21/1500<br/>b) Beratung der Beschlussempfehlung und des Berichts des Verteidigungsausschusses zu dem Antrag der Fraktion Die Linke<br/>Wehrpflicht nicht wieder einführen<br/>Drucksachen 21/1400, 21/1450'),
  row('12:00', '10', 'Pflege', 'Erste Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zur Stärkung der Pflege<br/>Drucksache 21/1550'),
  row('18:35', '11', 'Abschließende Beratungen ohne Aussprache', 'a) Beratung des Antrags der Fraktion der AfD<br/>Grenzkontrollen dauerhaft einführen<br/>Drucksache 21/1800'),
  row('19:00', 'ZP 3', 'Aktuelle Stunde', 'auf Verlangen der Fraktion der AfD<br/>Energiepreise'),
];

test('which Drucksachen an agenda item is about', () => {
  const [bill, mixed, firstReading, bundle, debate] = ROWS.map(parseRow);
  assert.deepEqual(vorlagenOf(bill), [{ nummer: '21/1234', kind: 'gesetz' }], 'the bill, not the committee report');
  assert.deepEqual(vorlagenOf(mixed), [{ nummer: '21/1500', kind: 'ueberweisung' }, { nummer: '21/1400', kind: 'beschlussempfehlung' }], 'one per part, the motion behind the report');
  assert.deepEqual(vorlagenOf(firstReading), [{ nummer: '21/1550', kind: 'ueberweisung' }]);
  assert.deepEqual(vorlagenOf(bundle), [], 'votes without debate are not the big topics');
  assert.deepEqual(vorlagenOf(debate), []);
  // an agenda row stored before parts had their own Drucksachen
  const old = { ...bill, parts: bill.parts.map(({ drucksachen, ...p }) => p) };
  assert.deepEqual(vorlagenOf(old), [{ nummer: '21/1234', kind: 'gesetz' }]);
});

test('a long Drucksache goes in as its opening, and says so', () => {
  const short = summaryPrompt({ nummer: '21/1', typ: 'Antrag', titel: 'T', text: 'Kurz.' });
  assert.doesNotMatch(short, /Auszug/);
  const long = summaryPrompt({ nummer: '21/2', typ: 'Gesetzentwurf', titel: 'T "x"', text: 'A. Problem und Ziel '.repeat(5000) });
  assert.match(long, /titel="T 'x'"/);
  assert.match(long, new RegExp(`\\(Auszug: der Anfang der Drucksache, ${SUMMARY_MAX_CHARS} von \\d+ Zeichen\\.\\)$`));
  assert.ok(long.length < SUMMARY_MAX_CHARS + 500);
});

test('summaries are written once per Drucksache, on Haiku, and a missing text is tried again later', async () => {
  const db = await makeDb();
  const today = berlinDate();
  await db.query('insert into agenda_days (sitting_date, session, items) values ($1, 24, $2)', [today, JSON.stringify(ROWS.map(parseRow))]);
  const dip = fakeDip();
  const missing = '21/1550';
  const realText = dip.drucksacheText;
  dip.drucksacheText = async (nummer) => (nummer === missing ? null : realText(nummer));
  const ctx = { db, dip, claude: fakeClaude(), config: makeConfig() };

  const pending = await pendingSummaries(db, { today });
  assert.deepEqual(pending, ['21/1234', '21/1500', '21/1400', '21/1550']);
  const run = await writeSummaries(ctx, pending);
  assert.equal(run.written, 3);
  assert.equal(run.failed, 1);
  assert.deepEqual(run.usage, { input: 300, output: 150, calls: 3 });
  assert.ok(ctx.claude.calls.every((c) => c.model === 'claude-haiku-5-5' && c.effort === 'low'));
  assert.match(ctx.claude.calls[0].prompt, /<drucksache nummer="21\/1234" typ="Gesetzentwurf"/);

  const row1 = await db.one('select * from drucksache_summaries where nummer = $1', ['21/1234']);
  assert.equal(row1.summary, 'Die Bundesregierung will mit der Drucksache 21/1234 etwas ändern.');
  assert.equal(row1.typ, 'Gesetzentwurf');
  assert.match(row1.pdf_url, /^https:\/\/dserver\.bundestag\.de\//);
  const failed = await db.one('select * from drucksache_summaries where nummer = $1', [missing]);
  assert.equal(failed.summary, '');
  assert.equal(failed.last_error, 'Text noch nicht in DIP');

  // Nothing is due right away; the missing one is due again after half a day.
  assert.deepEqual(await pendingSummaries(db, { today }), []);
  assert.deepEqual(await pendingSummaries(db, { today, now: new Date(Date.now() + 13 * 3600 * 1000) }), [missing]);
  await db.close();
});

test('the clock writes the summaries, and the preview shows them as AI summaries', async () => {
  const db = await makeDb();
  const today = berlinDate();
  await db.query('insert into agenda_days (sitting_date, session, items) values ($1, 24, $2)', [today, JSON.stringify(ROWS.map(parseRow))]);
  const ctx = { db, dip: fakeDip(), claude: fakeClaude(), config: makeConfig({ defaultLibrary: false }), mailer: fakeMailer() };

  const report = await tick(ctx, { now: new Date() });
  assert.equal(report.summaries.written, 4);
  assert.ok(await db.one(`select 1 as x from job_runs where kind = 'zusammenfassungen' and ok`));
  const again = await tick(ctx, { now: new Date() });
  assert.equal(again.summaries, null, 'nothing left to write, no job');

  const off = { ...ctx, config: makeConfig({ summaries: false }) };
  await db.query('delete from drucksache_summaries');
  assert.equal((await tick(off, { now: new Date() })).summaries, null, 'SUMMARIES=off');
  await tick(ctx, { now: new Date() });

  const app = await startApp(ctx);
  try {
    const page = (await browser(app.base).get('/vorschau')).text;
    assert.match(page, /<p class="agenda-about-title">Worum es geht<\/p>\s*<p>Die Bundesregierung will mit der Drucksache 21\/1234 etwas ändern\.<\/p>/);
    assert.match(page, /KI-Zusammenfassung der Drucksache <a href="https:\/\/dserver\.bundestag\.de\/[^"]+" target="_blank" rel="noopener">21\/1234 ↗<\/a> · kann Fehler enthalten/);
    // two parts, two summaries, each labelled with what it is
    assert.match(page, /<span class="pill">Gesetzentwurf<\/span> Die Bundesregierung will mit der Drucksache 21\/1500/);
    assert.match(page, /KI-Zusammenfassung der Drucksachen <a[^>]*>21\/1500 ↗<\/a>, <a[^>]*>21\/1400 ↗<\/a>/);
    // a first reading, folded under "Außerdem", carries its summary too
    assert.match(page, /<p class="agenda-rest-about">Die Bundesregierung will mit der Drucksache 21\/1550 etwas ändern\. <span class="meta">\(KI-Zusammenfassung/);
    assert.doesNotMatch(page, /21\/1800 etwas/, 'no summaries for votes without debate');
    assert.match(page, /Diese Zusammenfassungen schreibt eine KI/);
  } finally {
    await app.close();
    await db.close();
  }
});
