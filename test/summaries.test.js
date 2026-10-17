import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRow } from '../src/agenda.js';
import { tick } from '../src/scheduler.js';
import { pendingSummaries, SUMMARY_MAX_CHARS, SUMMARY_VERSION, summaryPrompt, vorlagenOf, writeSummaries } from '../src/summaries.js';
import { berlinDate } from '../src/text.js';
import { browser, fakeClaude, fakeDip, fakeMailer, makeConfig, makeDb, startApp } from './helpers.js';

const row = (time, top, title, detail) => ({ time, top, topic: { title, detail }, status: { title: '', detail: '' } });

// One sitting day: a bill, a committee report on a motion next to a first
// reading, votes without debate, and a debate without any Drucksache.
const ROWS = [
  row('09:00', '8', 'Mietpreisbremse', 'Zweite und dritte Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zur Verlängerung der Mietpreisbremse<br/>Drucksache 21/1234<br/>Beschlussempfehlung und Bericht des Rechtsausschusses<br/>Drucksache 21/1300'),
  row('10:40', '9', 'Wehrdienst', 'a) Erste Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zur Modernisierung des Wehrdienstes<br/>Drucksache 21/1500<br/>b) Beratung der Beschlussempfehlung und des Berichts des Verteidigungsausschusses zu dem Antrag der Fraktion Die Linke<br/>Wehrpflicht nicht wieder einführen<br/>Drucksachen 21/1400, 21/1450'),
  row('12:00', '10', 'Pflege', 'Erste Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zur Stärkung der Pflege<br/>Drucksache 21/1550<br/>Überweisungsvorschlag:<br/>Ausschuss für Gesundheit (f)<br/>Haushaltsausschuss gemäß § 96 GO'),
  row('18:35', '11', 'Abschließende Beratungen ohne Aussprache', 'a) Beratung des Antrags der Fraktion der AfD<br/>Grenzkontrollen dauerhaft einführen<br/>Drucksache 21/1800'),
  row('19:00', 'ZP 3', 'Aktuelle Stunde', 'auf Verlangen der Fraktion der AfD<br/>Energiepreise'),
];

const REPORTS = { '21/1300': 'Beschlussempfehlung und Bericht', '21/1450': 'Beschlussempfehlung und Bericht' };

test('which Drucksachen an agenda item is about', () => {
  const [bill, mixed, firstReading, bundle, debate] = ROWS.map(parseRow);
  assert.deepEqual(vorlagenOf(bill), [{ nummer: '21/1234', kind: 'gesetz' }, { nummer: '21/1300', kind: 'bericht' }], 'the bill, then the committee report on it');
  assert.deepEqual(
    vorlagenOf(mixed),
    [{ nummer: '21/1500', kind: 'ueberweisung' }, { nummer: '21/1400', kind: 'beschlussempfehlung' }, { nummer: '21/1450', kind: 'bericht' }],
    'one per part: the bill at its first reading; the motion and the report on it',
  );
  assert.deepEqual(vorlagenOf(firstReading), [{ nummer: '21/1550', kind: 'ueberweisung' }]);
  assert.deepEqual(vorlagenOf(bundle), [], 'votes without debate are not the big topics');
  assert.deepEqual(vorlagenOf(debate), []);
  // an agenda row stored before parts had their own Drucksachen
  const old = { ...bill, parts: bill.parts.map(({ drucksachen, report, referral, ...p }) => p) };
  assert.deepEqual(vorlagenOf(old), [{ nummer: '21/1234', kind: 'gesetz' }]);
  assert.equal(firstReading.parts[0].referral, 'Ausschuss für Gesundheit (federführend), Haushaltsausschuss');
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
  const dip = fakeDip({ types: REPORTS });
  const missing = '21/1550';
  const realText = dip.drucksacheText;
  dip.drucksacheText = async (nummer) => (nummer === missing ? null : realText(nummer));
  const ctx = { db, dip, claude: fakeClaude(), config: makeConfig() };

  const pending = await pendingSummaries(db, { today });
  assert.deepEqual(pending, ['21/1234', '21/1300', '21/1500', '21/1400', '21/1450', '21/1550']);
  const run = await writeSummaries(ctx, pending);
  assert.equal(run.written, 5);
  assert.equal(run.failed, 1);
  assert.deepEqual(run.usage, { input: 500, output: 250, calls: 5 });
  // a committee report gets the prompt for committee reports
  const reportCall = ctx.claude.calls.find((c) => /nummer="21\/1300"/.test(c.prompt));
  assert.match(reportCall.prompt, /typ="Beschlussempfehlung und Bericht"/);
  assert.match(reportCall.system, /Bericht eines Bundestagsausschusses/);
  assert.match(ctx.claude.calls.find((c) => /nummer="21\/1234"/.test(c.prompt)).system, /fasst eine Drucksache/);
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
  assert.equal(row1.kurz, 'Kurz gesagt: 21/1234.');
  assert.equal(row1.version, SUMMARY_VERSION);

  // A summary from an older prompt is written again at once, and stays on
  // the page while a new try fails.
  await db.query(`update drucksache_summaries set version = 1, kurz = '' where nummer = '21/1234'`);
  assert.deepEqual(await pendingSummaries(db, { today }), ['21/1234']);
  const broken = { ...ctx, claude: { json: async () => { throw new Error('Anthropic nicht erreichbar.'); } } };
  await writeSummaries(broken, ['21/1234']);
  const kept = await db.one('select * from drucksache_summaries where nummer = $1', ['21/1234']);
  assert.equal(kept.summary, row1.summary, 'the old summary is kept');
  assert.equal(kept.version, 1);
  assert.deepEqual(await pendingSummaries(db, { today }), [], 'and not retried on every tick');
  await writeSummaries(ctx, ['21/1234']);
  const fresh = await db.one('select * from drucksache_summaries where nummer = $1', ['21/1234']);
  assert.equal(fresh.version, SUMMARY_VERSION);
  assert.equal(fresh.kurz, 'Kurz gesagt: 21/1234.');
  assert.equal(fresh.last_error, '');
  await db.close();
});

test('the clock writes the summaries, and the preview shows them as AI summaries', async () => {
  const db = await makeDb();
  const today = berlinDate();
  await db.query('insert into agenda_days (sitting_date, session, items) values ($1, 24, $2)', [today, JSON.stringify(ROWS.map(parseRow))]);
  const ctx = { db, dip: fakeDip({ types: REPORTS }), claude: fakeClaude(), config: makeConfig({ defaultLibrary: false }), mailer: fakeMailer() };

  const report = await tick(ctx, { now: new Date() });
  assert.equal(report.summaries.written, 6);
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
    // closed: one sentence; open: the summary, marked as written by an AI
    assert.match(page, /<span class="agenda-teaser">Kurz gesagt: 21\/1234\.<\/span>/);
    assert.match(page, /<p class="agenda-about-title">Worum es geht <span class="meta">· Gesetzentwurf · Bundesregierung<\/span><\/p>\s*<p>Die Bundesregierung will mit der Drucksache 21\/1234 etwas ändern\.<\/p>/);
    assert.match(page, /KI-Zusammenfassung der Drucksache <a href="https:\/\/dserver\.bundestag\.de\/[^"]+" target="_blank" rel="noopener">21\/1234 ↗<\/a> · kann Fehler enthalten/);
    // two parts: the bill is the main one, the motion is "debated together", in one line
    assert.match(page, /<span class="agenda-teaser">Kurz gesagt: 21\/1500\.<\/span><span class="agenda-more meta">Gemeinsam beraten mit einer weiteren Vorlage<\/span>/);
    assert.match(page, /<p class="agenda-about-title">Gemeinsam beraten<\/p>[\s\S]*?<span class="pill">Beschlussempfehlung<\/span> <strong>Wehrpflicht nicht wieder einführen<\/strong> <span class="meta">Antrag · Linke<\/span>\s*<span class="agenda-together-kurz">Kurz gesagt: 21\/1400\. <span class="meta">\(KI-Zusammenfassung, Drucksache <a[^>]*>21\/1400 ↗<\/a>\)<\/span><\/span>/);
    assert.doesNotMatch(page, /Die Bundesregierung will mit der Drucksache 21\/1400/, 'the other one in one line, not in full');
    // a first reading, folded under "Außerdem", carries its one line too
    assert.match(page, /<p class="agenda-rest-about">Kurz gesagt: 21\/1550\. <span class="meta">\(KI-Zusammenfassung, Drucksache <a[^>]*>21\/1550 ↗<\/a>\)<\/span><\/p>/);
    assert.doesNotMatch(page, /21\/1800\./, 'no summaries for votes without debate');
    // what the committee made of it, and where a first reading goes
    assert.match(page, /<p class="agenda-about-title">Aus dem Ausschuss<\/p>\s*<p>Die Bundesregierung will mit der Drucksache 21\/1300 etwas ändern\.<\/p>\s*<p class="meta">KI-Zusammenfassung des Ausschussberichts <a[^>]*>21\/1300 ↗<\/a>/);
    assert.match(page, /<strong>Ausschuss:<\/strong> Kurz gesagt: 21\/1450\./, 'the report on the motion debated alongside, in one line');
    assert.match(page, /Geht zur Beratung an: Ausschuss für Gesundheit \(federführend\), Haushaltsausschuss/);
    assert.match(page, /Diese Zusammenfassungen schreibt eine KI/);
  } finally {
    await app.close();
    await db.close();
  }
});
