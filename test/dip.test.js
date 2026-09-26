import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyOutcome, createDipClient, extractDecisions, syncDecisions } from '../src/dip.js';
import { findVotePassages } from '../src/protocol.js';
import { makeDb, samplePositions, SAMPLE_PROTOCOL } from './helpers.js';

test('extractDecisions merges readings, skips referrals, Bundesrat and non-plenary positions', () => {
  const decisions = extractDecisions(samplePositions());
  const titles = decisions.map((d) => d.title).sort();
  assert.deepEqual(titles, ['Gesetz zur Verlängerung der Mietpreisbremse', 'Kostenloses Mittagessen an allen Schulen', 'Sammelübersicht 42 zu Petitionen']);

  const bill = decisions.find((d) => d.vorgangId === '318001');
  assert.equal(bill.key, '318001@2026-09-24');
  assert.equal(bill.positions.length, 2, '2nd and 3rd reading are one decision');
  assert.equal(bill.outcome, 'angenommen');
  assert.deepEqual(bill.drucksachen, ['21/1234', '21/1300']);
  assert.equal(bill.protocol.dokumentnummer, '21/45');
  assert.match(bill.protocol.pdfUrl, /21045\.pdf/);

  const motion = decisions.find((d) => d.vorgangId === '318002');
  assert.equal(motion.outcome, 'abgelehnt');

  const petitions = decisions.find((d) => d.vorgangId === '318004');
  assert.ok(petitions.importance < 0, 'petitions go to the short list');
  assert.ok(bill.importance > motion.importance && motion.importance > 0);
});

test('classifyOutcome', () => {
  assert.equal(classifyOutcome('Annahme in Ausschussfassung'), 'angenommen');
  assert.equal(classifyOutcome('Ablehnung der Vorlage'), 'abgelehnt');
  assert.equal(classifyOutcome('Erledigterklärung'), 'erledigt');
  assert.equal(classifyOutcome('Kenntnisnahme'), 'sonstiges');
});

test('DIP client sends the key, follows the cursor and stops when it repeats', async () => {
  const seen = [];
  const pages = { undefined: { cursor: 'A', documents: [{ id: 1 }, { id: 2 }] }, A: { cursor: 'B', documents: [{ id: 3 }] }, B: { cursor: 'B', documents: [] } };
  const fetch = async (url, opts) => {
    seen.push({ url: String(url), auth: opts.headers.Authorization });
    const cursor = new URL(url).searchParams.get('cursor') ?? undefined;
    return new Response(JSON.stringify(pages[cursor]), { status: 200 });
  };
  const dip = createDipClient({ apiKey: 'KEY', baseUrl: 'https://dip.test/api/v1', fetch });
  const docs = await dip.positions('2026-09-24', '2026-09-25');
  assert.deepEqual(docs.map((d) => d.id), [1, 2, 3]);
  assert.equal(seen[0].auth, 'ApiKey KEY');
  assert.match(seen[0].url, /\/vorgangsposition\?f\.datum\.start=2026-09-24&f\.datum\.end=2026-09-25&format=json$/);
  assert.match(seen[1].url, /cursor=A/);
});

test('DIP client explains a rejected key', async () => {
  const dip = createDipClient({ apiKey: 'OLD', baseUrl: 'https://dip.test', fetch: async () => new Response('nope', { status: 401 }) });
  await assert.rejects(dip.positions('2026-01-01', '2026-01-02'), /401 \(API-Key ungültig oder abgelaufen\?\)/);
  const noKey = createDipClient({ apiKey: '', baseUrl: 'https://dip.test' });
  await assert.rejects(noKey.vorgang('1'), /DIP_API_KEY/);
});

test('syncDecisions inserts once and only touches rows whose data changed', async () => {
  const db = await makeDb();
  let positions = samplePositions();
  const dip = { positions: async () => positions };

  const first = await syncDecisions({ db, dip }, { start: '2026-09-20', end: '2026-09-25' });
  assert.equal(first.inserted, 3);
  const again = await syncDecisions({ db, dip }, { start: '2026-09-20', end: '2026-09-25' });
  assert.equal(again.inserted, 0);
  assert.equal(again.changed, 0, 'unchanged data is not an update');

  positions = positions.map((p) => (p.id === '9003' ? { ...p, beschlussfassung: [{ beschlusstenor: 'Annahme' }] } : p));
  const third = await syncDecisions({ db, dip }, { start: '2026-09-20', end: '2026-09-25' });
  assert.equal(third.changed, 1);
  const row = await db.one(`select outcome from decisions where vorgang_id = '318002'`);
  assert.equal(row.outcome, 'angenommen');
  await db.close();
});

test('findVotePassages finds the vote formula for the right agenda item only', () => {
  const votes = findVotePassages(SAMPLE_PROTOCOL, ['21/1234', '21/1300']);
  assert.match(votes, /mit den Stimmen der Fraktionen der CDU\/CSU und SPD gegen die Stimmen der Fraktion der AfD/);
  assert.match(votes, /mit dem gleichen Stimmenverhältnis wie zuvor angenommen/);
  assert.doesNotMatch(votes, /Die Linke bei Enthaltung der Fraktion Bündnis 90\/Die Grünen abgelehnt/, 'the next item is cut off');
  assert.doesNotMatch(votes, /soziale Frage/, 'speeches are not vote sentences');

  const motion = findVotePassages(SAMPLE_PROTOCOL, ['21/1400']);
  assert.match(motion, /Der Antrag ist mit den Stimmen der Fraktionen CDU\/CSU, AfD und SPD gegen die Stimmen der Fraktion Die Linke/);
  assert.equal(findVotePassages(SAMPLE_PROTOCOL, ['21/9999']), '');
  assert.equal(findVotePassages('', ['21/1234']), '');
  assert.equal(findVotePassages(SAMPLE_PROTOCOL, ['1/1234']), '', 'no partial number matches');
});

test('the same positions in another order are the same decisions, so a day can settle', async () => {
  const positions = samplePositions();
  assert.deepEqual(extractDecisions([...positions].reverse()), extractDecisions(positions));

  const db = await makeDb();
  const dip = { positions: async () => positions };
  await syncDecisions({ db, dip }, { start: '2026-09-24', end: '2026-09-24' });
  dip.positions = async () => [...positions].reverse(); // DIP sorts by last update, which moves
  const again = await syncDecisions({ db, dip }, { start: '2026-09-24', end: '2026-09-24' });
  assert.equal(again.changed, 0);
  await db.close();
});
