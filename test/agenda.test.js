import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgendaClient, drucksachenIn, isoWeek, isoWeekMonday, parseGermanDate, parseRow, parseWeek, syncAgenda, upcomingAgenda } from '../src/agenda.js';
import { tick } from '../src/scheduler.js';
import { addDays, berlinDate } from '../src/text.js';
import { browser, fakeMailer, makeConfig, makeDb, startApp } from './helpers.js';

// A week as bundestag.de's conferenceWeekJSON returns it (abridged): one
// sitting day with the usual mix, and one with an election.
function sampleWeek({ next = { year: 2026, week: 43 }, days = ['7. Oktober 2026', '8. Oktober 2026'] } = {}) {
  const row = (time, top, title, detail, extra = {}) => ({ time, top, topic: { title, detail, ...extra }, status: { title: '', detail: '' }, isProtocol: false });
  const conferences = [
    {
      conferenceNumber: 23,
      conferenceDate: { date: days[0] },
      rows: [
        row('13:00', '', 'Sitzungseröffnung', ''),
        row('13:00', '1', 'Befragung der Bundesregierung', 'Befragung der Bundesregierung', { link: '/dokumente/textarchiv/2026/kw41-de-regierungsbefragung-1' }),
        row(
          '15:30',
          '5',
          'Mietpreisbremse',
          'Zweite und dritte Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zur Verlängerung der Mietpreisbremse<br/>Drucksache <a href="https://dserver.bundestag.de/btd/21/012/2101234.pdf">21/1234</a><br/>Beschlussempfehlung und Bericht des Rechtsausschusses (6.&nbsp;Ausschuss)<br/>Drucksache 21/1300',
          { link: '/dokumente/textarchiv/2026/kw41-de-mietpreisbremse-2' },
        ),
        row(
          '16:40',
          '6',
          'Wehrdienst',
          'a) Erste Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zur Modernisierung des Wehrdienstes<br/>Drucksache 21/1500<br/>Überweisungsvorschlag: Verteidigungsausschuss (f)<br/>b) Beratung der Beschlussempfehlung und des Berichts des Verteidigungsausschusses (12. Ausschuss) zu dem Antrag der Fraktion Die Linke<br/>Wehrpflicht nicht wieder einführen<br/>Drucksachen 21/1400, 21/1450',
        ),
        row('17:50', '7', 'Kostenloses Mittagessen', 'Beratung des Antrags der Fraktion Die Linke<br/>Kostenloses Mittagessen an allen Schulen<br/>Drucksache 21/1600'),
        row('18:30', '8', 'Überweisungen im vereinfachten Verfahren', 'a) Erste Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zu dem Abkommen vom 3. März 2026<br/>Drucksache 21/1700'),
        row(
          '18:35',
          '9',
          'Abschließende Beratungen ohne Aussprache',
          'a) Beratung des Antrags der Fraktion der AfD<br/>Grenzkontrollen dauerhaft einführen<br/>Drucksache 21/1800<br/>b) Beratung der Beschlussempfehlung des Petitionsausschusses (2. Ausschuss)<br/>Sammelübersicht 42 zu Petitionen<br/>Drucksache 21/1900',
        ),
        row('19:00', 'ZP 3', 'Aktuelle Stunde', 'auf Verlangen der Fraktion der AfD<br/>Energiepreise'),
      ],
    },
    {
      conferenceNumber: 24,
      conferenceDate: { date: days[1] },
      rows: [row('09:00', '10', 'Parlamentarisches Kontrollgremium', 'Wahl eines Mitglieds des Parlamentarischen Kontrollgremiums<br/>Drucksache 21/2000')],
    },
  ];
  return { previous: { year: 2026, week: 39 }, next, conferences: conferences.slice(0, days.length) };
}

function fakeAgenda(weeks) {
  const calls = [];
  return {
    calls,
    async week(year, week) {
      calls.push(`${year}-${week}`);
      return weeks[`${year}-${week}`] ?? null;
    },
  };
}

test('ISO weeks and German dates', () => {
  assert.deepEqual(isoWeek('2026-09-28'), { year: 2026, week: 40 });
  assert.deepEqual(isoWeek('2026-01-01'), { year: 2026, week: 1 });
  assert.deepEqual(isoWeek('2027-01-03'), { year: 2026, week: 53 }, 'a Sunday belongs to the week of its Monday');
  assert.deepEqual(isoWeek('2025-11-12'), { year: 2025, week: 46 });
  assert.equal(isoWeekMonday({ year: 2026, week: 1 }), '2025-12-29');
  assert.equal(isoWeekMonday({ year: 2026, week: 40 }), '2026-09-28');
  assert.equal(parseGermanDate('4. März 2026'), '2026-03-04');
  assert.equal(parseGermanDate('Mittwoch, 12. November 2025'), '2025-11-12');
  assert.equal(parseGermanDate('irgendwann'), '');
});

test('which agenda items end in a vote', () => {
  const [day] = parseWeek(sampleWeek());
  const byTitle = Object.fromEntries(day.items.map((i) => [i.title, i]));

  const bill = byTitle.Mietpreisbremse;
  assert.equal(bill.kind, 'gesetz');
  assert.equal(bill.vote, true);
  assert.equal(bill.time, '15:30');
  assert.equal(bill.top, '5');
  assert.deepEqual(bill.drucksachen.map((d) => d.nummer), ['21/1234', '21/1300']);
  assert.equal(bill.drucksachen[0].url, 'https://dserver.bundestag.de/btd/21/012/2101234.pdf');
  assert.equal(bill.link, 'https://www.bundestag.de/dokumente/textarchiv/2026/kw41-de-mietpreisbremse-2');
  assert.match(bill.parts[0].text, /6\. Ausschuss/, 'entities are decoded');
  assert.doesNotMatch(bill.parts[0].text, /Drucksache/, 'the Drucksachen are links, not text');

  // a first reading next to a committee report: the report is voted on
  const mixed = byTitle.Wehrdienst;
  assert.equal(mixed.kind, 'beschlussempfehlung');
  assert.equal(mixed.vote, true);
  assert.equal(mixed.votes, 1);
  assert.deepEqual(mixed.parts.map((p) => p.kind), ['ueberweisung', 'beschlussempfehlung']);
  assert.doesNotMatch(mixed.parts[0].text, /Überweisungsvorschlag/);

  assert.equal(byTitle['Kostenloses Mittagessen'].kind, 'antrag', 'a motion without a report is usually referred');
  assert.equal(byTitle['Kostenloses Mittagessen'].vote, false);
  assert.equal(byTitle['Überweisungen im vereinfachten Verfahren'].vote, false);

  const final = byTitle['Abschließende Beratungen ohne Aussprache'];
  assert.equal(final.kind, 'abschliessend');
  assert.equal(final.votes, 2, 'without debate, motions are voted on too');

  assert.equal(byTitle['Aktuelle Stunde'].vote, false);
  assert.equal(byTitle['Befragung der Bundesregierung'].kind, 'sonstiges');

  const [, second] = parseWeek(sampleWeek());
  assert.equal(second.items[0].kind, 'wahl');
  assert.equal(second.session, 24);
  assert.equal(parseRow({ topic: { title: 'Verordnung', detail: 'Beratung der Verordnung über die Wahl der Vertreter' } }).kind, 'sonstiges', 'an election in passing is none');
  assert.equal(parseRow({ topic: { title: 'Haushalt', detail: 'Einzelplan 14<br/>Bundesministerium der Verteidigung' } }).vote, true, 'the budget is voted on by Einzelplan');
});

test('the agenda text is plain text, and only Bundestag links survive', () => {
  const item = parseRow({
    time: '9:05',
    top: 'ZP 1',
    topic: { title: '&lt;script&gt;alert(1)&lt;/script&gt; <b>Fett</b>', detail: 'Text <img src=x onerror=alert(1)>weiter', link: 'javascript:alert(1)' },
    status: { title: 'angenommen', detail: 'Ja: 350<br/>Nein: 200' },
  });
  assert.equal(item.title, '<script>alert(1)</script> Fett', 'decoded and without markup – the views escape it');
  assert.equal(item.parts[0].text, 'Text weiter');
  assert.equal(item.link, '');
  assert.equal(item.time, '09:05');
  assert.equal(item.status, 'angenommen');
  assert.equal(item.statusDetail, 'Ja: 350 · Nein: 200');
  for (const link of ['https://evil.example/x', '//evil.example/x', 'http://www.bundestag.de/x']) {
    assert.equal(parseRow({ topic: { title: 'x', link } }).link, '', link);
  }
  assert.equal(parseRow({ topic: { title: 'x', link: 'https://www.bundestag.de/a' } }).link, 'https://www.bundestag.de/a');
  assert.deepEqual(drucksachenIn(['Richtlinie (EU) 2019/1937, Nr. 3/2024', 'Drucksache 21/…']), [], 'no Drucksache without a number on a Drucksache line');
  assert.deepEqual(drucksachenIn(['Drucksachen 21/77, 21/77 (neu)']).map((d) => d.url), ['https://dserver.bundestag.de/btd/21/000/2100077.pdf']);
});

test('agenda client: the address, 404 as "no sitting", and anything but JSON as an error', async () => {
  const seen = [];
  const responses = [
    new Response(JSON.stringify(sampleWeek()), { status: 200 }),
    new Response('Not found', { status: 404 }),
    new Response('<html>Wartungsarbeiten</html>', { status: 200 }),
    new Response(JSON.stringify({ foo: 1 }), { status: 200 }),
    new Response('', { status: 503 }),
  ];
  const client = createAgendaClient({
    baseUrl: 'https://bt.example/apps/plenar/plenar',
    userAgent: 'Test/1.0',
    fetch: async (url, opts) => {
      seen.push({ url: String(url), ua: opts.headers['User-Agent'] });
      return responses.shift();
    },
  });
  const data = await client.week(2026, 41);
  assert.equal(data.conferences.length, 2);
  assert.deepEqual(seen[0], { url: 'https://bt.example/apps/plenar/plenar/conferenceWeekJSON?year=2026&week=41', ua: 'Test/1.0' });
  assert.equal(await client.week(2026, 42), null);
  await assert.rejects(client.week(2026, 43), /keine JSON-Antwort/);
  await assert.rejects(client.week(2026, 44), /unerwartetes Format/);
  await assert.rejects(client.week(2026, 45), /503/);
});

test('syncAgenda skips a recess week, follows "next", and forgets a cancelled day', async () => {
  const db = await makeDb();
  const weeks = {
    // KW 40: recess, no page
    '2026-41': sampleWeek(),
    '2026-43': { previous: { year: 2026, week: 41 }, next: null, conferences: [{ conferenceNumber: 25, conferenceDate: { date: '21. Oktober 2026' }, rows: [] }] },
  };
  const agenda = fakeAgenda(weeks);
  await db.query(`insert into agenda_days (sitting_date, session, items) values ('2026-09-24', 20, '[]')`);

  const r = await syncAgenda({ db, agenda }, { today: '2026-09-28' });
  assert.deepEqual(agenda.calls, ['2026-40', '2026-41', '2026-43']);
  assert.equal(r.upcoming, 3);
  assert.equal(r.votes, 4);
  let days = await upcomingAgenda(db, { today: '2026-09-28' });
  assert.deepEqual(days.map((d) => d.sitting_date), ['2026-10-07', '2026-10-08', '2026-10-21']);
  assert.equal(days[0].session, 23);
  assert.equal(days[0].items.find((i) => i.title === 'Mietpreisbremse').kind, 'gesetz');

  // The Thursday is cancelled; the past stays as it was.
  weeks['2026-41'] = sampleWeek({ days: ['7. Oktober 2026'] });
  await syncAgenda({ db, agenda }, { today: '2026-09-28' });
  days = await upcomingAgenda(db, { today: '2026-09-28' });
  assert.deepEqual(days.map((d) => d.sitting_date), ['2026-10-07', '2026-10-21']);
  assert.ok(await db.one(`select 1 as x from agenda_days where sitting_date = '2026-09-24'`));

  // A day nobody has confirmed for a week is not shown as if it still held.
  await db.query(`update agenda_days set fetched_at = now() - interval '8 days' where sitting_date = '2026-10-21'`);
  days = await upcomingAgenda(db, { today: '2026-09-28' });
  assert.deepEqual(days.map((d) => d.sitting_date), ['2026-10-07']);

  // Nothing planned at all: a bounded number of requests, nothing stored.
  const empty = fakeAgenda({});
  const none = await syncAgenda({ db, agenda: empty }, { today: '2026-12-21', maxRequests: 4 });
  assert.equal(none.requests, 4);
  assert.deepEqual(empty.calls, ['2026-52', '2026-53', '2027-1', '2027-2']);
  await db.close();
});

test('the preview page, the home teaser, navigation and sitemap', async () => {
  const db = await makeDb();
  const today = berlinDate();
  const [a, b] = parseWeek(sampleWeek());
  a.items[2].title = '<script>alert(1)</script> Mietpreisbremse';
  await db.query(`insert into agenda_days (sitting_date, session, items) values ($1, 23, $2), ($3, 24, $4)`, [today, JSON.stringify(a.items), addDays(today, 1), JSON.stringify(b.items)]);
  const app = await startApp({ db, config: makeConfig(), mailer: fakeMailer() });
  try {
    const bw = browser(app.base);
    const page = await bw.get('/vorschau');
    assert.equal(page.status, 200);
    assert.match(page.text, /Darüber stimmt der Bundestag ab/);
    assert.match(page.text, /<a href="\/vorschau" aria-current="page">Vorschau<\/a>/);
    assert.match(page.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt; Mietpreisbremse/);
    assert.doesNotMatch(page.text, /<script>alert/);
    assert.match(page.text, /Abstimmung über ein Gesetz/);
    assert.match(page.text, /Heute/);
    assert.match(page.text, /3 Punkte mit Abstimmung/, 'bill, committee report, final votes – not the motion, not the referrals');
    assert.match(page.text, /Abstimmung möglich[\s\S]*Kostenloses Mittagessen/);
    assert.match(page.text, /Außerdem auf der Tagesordnung \(3\)/, 'opening and closing are left out');
    assert.match(page.text, /href="https:\/\/dserver\.bundestag\.de\/btd\/21\/012\/2101234\.pdf"/);
    assert.match(page.text, /href="\/programme\?q=Wehrdienst"/);
    assert.match(page.text, /<link rel="canonical" href="http:\/\/localhost:3999\/vorschau">/);

    const home = await bw.get('/');
    assert.match(home.text, /Demnächst im Bundestag/);
    assert.match(home.text, /Wahl im Plenum|1 Punkt mit Abstimmung: Parlamentarisches Kontrollgremium/);

    assert.match((await bw.get('/sitemap.xml')).text, /<loc>http:\/\/localhost:3999\/vorschau<\/loc>/);

    await db.query('delete from agenda_days');
    const empty = await bw.get('/vorschau');
    assert.match(empty.text, /Gerade steht keine Sitzung an/);
    assert.doesNotMatch((await bw.get('/')).text, /Demnächst im Bundestag/);
  } finally {
    await app.close();
    await db.close();
  }
});

test('the clock fetches the agenda, and a failure is a note, not a crash', async () => {
  const db = await makeDb();
  const { week } = isoWeek(berlinDate(new Date('2026-09-28T08:00:00Z')));
  const agenda = fakeAgenda({ [`2026-${week}`]: sampleWeek({ next: null, days: ['30. September 2026', '1. Oktober 2026'] }) });
  const ctx = { db, config: makeConfig(), mailer: fakeMailer(), agenda };
  const report = await tick(ctx, { now: new Date('2026-09-28T08:00:00Z'), forceSync: true });
  assert.equal(report.agenda.upcoming, 2);
  assert.ok(await db.one(`select 1 as x from job_runs where kind = 'tagesordnung' and ok`));

  ctx.agenda = { week: async () => { throw new Error('Tagesordnung nicht erreichbar: boom'); } };
  const failed = await tick(ctx, { now: new Date('2026-09-28T09:00:00Z'), forceSync: true });
  assert.ok(failed.notes.some((n) => /Tagesordnung: .*boom/.test(n)));
  await db.close();
});
