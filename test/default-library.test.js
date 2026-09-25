import assert from 'node:assert/strict';
import test from 'node:test';

import { checkProgramPdf, importDefaultPrograms, libraryStatus, onDomains } from '../src/default-library.js';
import { DEFAULT_PROGRAMS, NOT_THE_FULL_VERSION } from '../src/program-sources.js';
import { tick } from '../src/scheduler.js';
import { makeConfig, makeDb, makePdf } from './helpers.js';

const PAGE = [
  'Mehr für Dich. Besser für Deutschland. Regierungsprogramm der SPD zur Wahl.',
  'Wir werden die Mietpreisbremse unbefristet verlängern und Mieter schützen.',
  'Gute Arbeit, gute Löhne und ein starker Sozialstaat für alle Menschen hier.',
];
const OTHER = ['Ein ganz anderes Dokument über Gartenbau und Obstbäume im Frühling.', 'Äpfel, Birnen und Kirschen brauchen Sonne, Wasser und etwas Geduld.', 'Dazu gehören Schnitt, Pflege und ein Plan für den Winter im Garten.'];

const source = (overrides = {}) => ({
  key: 'test-spd',
  party: 'SPD',
  title: 'Mehr für Dich. Besser für Deutschland.',
  kind: 'wahlprogramm',
  election: 'Bundestagswahl 2025',
  urls: ['https://www.spd.de/alt.pdf', 'https://www.spd.de/neu.pdf'],
  domains: ['spd.de'],
  expect: ['mehr für dich', 'regierungsprogramm'],
  minPages: 3,
  ...overrides,
});

// A tiny web: URL -> PDF bytes, or a status code. Everything else is a 404.
function fakeWeb(files) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, agent: opts.headers && opts.headers['User-Agent'] });
    const f = files[u];
    if (f === undefined) return new Response('nicht gefunden', { status: 404 });
    if (typeof f === 'number') return new Response('fehler', { status: f });
    return new Response(f, { status: 200, headers: { 'content-type': 'application/pdf' } });
  };
  return { fetch, calls };
}

async function setup(files, extra = {}) {
  const db = await makeDb();
  const web = fakeWeb(files);
  return { web, ctx: { db, config: makeConfig(), fetch: web.fetch, claude: null, embedder: null, ...extra } };
}

test('imports from the first address that passes the checks', async () => {
  const program = await makePdf([PAGE, PAGE, PAGE, PAGE]);
  const { ctx, web } = await setup({ 'https://www.spd.de/neu.pdf': program });
  const report = await importDefaultPrograms(ctx, { sources: [source()] });
  assert.deepEqual(report.imported, ['test-spd']);
  assert.deepEqual(report.failed, []);

  const row = await ctx.db.one(`select * from programs where source_key = 'test-spd'`);
  assert.equal(row.status, 'ready');
  assert.equal(row.source_url, 'https://www.spd.de/neu.pdf');
  assert.equal(row.page_count, 4);
  assert.equal(row.party, 'SPD');
  assert.ok((await ctx.db.one('select count(*)::int as n from program_chunks where program_id = $1', [row.id])).n >= 4);
  assert.match(web.calls[0].agent, /Mozilla\/5\.0/);

  const job = await ctx.db.one(`select ok, summary from job_runs where kind = 'programm:test-spd'`);
  assert.equal(job.ok, true);
  assert.match(job.summary, /alt\.pdf: Download fehlgeschlagen: HTTP 404/);
  await ctx.db.close();
});

test('short versions and other documents are turned away', async () => {
  const { ctx } = await setup({
    'https://www.spd.de/alt.pdf': await makePdf([PAGE, PAGE]),
    'https://www.spd.de/neu.pdf': await makePdf([OTHER, OTHER, OTHER, OTHER]),
  });
  const report = await importDefaultPrograms(ctx, { sources: [source()] });
  assert.deepEqual(report.imported, []);
  assert.match(report.failed[0].error, /Kein passendes PDF/);
  assert.equal(await ctx.db.one(`select id from programs where source_key = 'test-spd'`), null, 'nothing half-imported');
  const job = await ctx.db.one(`select ok, summary from job_runs where kind = 'programm:test-spd'`);
  assert.equal(job.ok, false);
  assert.match(job.summary, /nur 2 Seiten – vermutlich nicht die Langfassung/);
  assert.match(job.summary, /erwartete Titel/);
  await ctx.db.close();
});

test('web search finds a moved file, but only on the party’s own domains', async () => {
  const moved = 'https://www.spd.de/aktuell/2025_Regierungsprogramm.pdf';
  const asked = [];
  const claude = {
    async findUrls(req) {
      asked.push(req);
      return ['https://evil.example/spd.pdf', 'https://www.spd.de/kurzfassung.pdf', 'https://www.spd.de/programm.html', moved];
    },
  };
  const { ctx, web } = await setup({ [moved]: await makePdf([PAGE, PAGE, PAGE]), 'https://evil.example/spd.pdf': await makePdf([PAGE, PAGE, PAGE]) }, { claude });
  const report = await importDefaultPrograms(ctx, { sources: [source()] });
  assert.deepEqual(report.imported, ['test-spd']);
  assert.deepEqual(asked[0].domains, ['spd.de']);
  assert.match(asked[0].prompt, /Mehr für Dich/);
  const fetched = web.calls.map((c) => c.url);
  assert.ok(!fetched.includes('https://evil.example/spd.pdf'), 'other domains are never fetched');
  assert.ok(!fetched.includes('https://www.spd.de/kurzfassung.pdf'), 'short versions are skipped');
  assert.equal((await ctx.db.one(`select source_url from programs where source_key = 'test-spd'`)).source_url, moved);
  await ctx.db.close();
});

test('an imported programme is never downloaded again', async () => {
  const { ctx, web } = await setup({ 'https://www.spd.de/alt.pdf': await makePdf([PAGE, PAGE, PAGE]) });
  await importDefaultPrograms(ctx, { sources: [source()] });
  const calls = web.calls.length;
  const again = await importDefaultPrograms(ctx, { sources: [source()], force: true });
  assert.deepEqual(again.imported, []);
  assert.equal(web.calls.length, calls);
  await ctx.db.close();
});

test('after three failures in a day it waits – unless forced', async () => {
  const { ctx, web } = await setup({});
  for (let i = 0; i < 5; i++) await importDefaultPrograms(ctx, { sources: [source()] });
  assert.equal(web.calls.length, 3 * 2, 'three attempts at two addresses');
  const skipped = await importDefaultPrograms(ctx, { sources: [source()] });
  assert.deepEqual(skipped.skipped, ['test-spd']);
  await importDefaultPrograms(ctx, { sources: [source()], force: true });
  assert.equal(web.calls.length, 4 * 2);
  await ctx.db.close();
});

test('a failed import is retried into the same row and shows in the status', async () => {
  const { ctx } = await setup({ 'https://www.spd.de/alt.pdf': await makePdf([PAGE, PAGE, PAGE]) });
  // A row left in "error" by an earlier attempt (e.g. the process died mid-import).
  await ctx.db.query(`insert into programs (slug, party, title, source_key, status, error) values ('spd-alt', 'SPD', 'Alt', 'test-spd', 'error', 'kaputt')`);
  await importDefaultPrograms(ctx, { sources: [source()] });
  const rows = await ctx.db.query(`select status, title from programs where source_key = 'test-spd'`);
  assert.equal(rows.rows.length, 1);
  assert.deepEqual(rows.rows[0], { status: 'ready', title: 'Mehr für Dich. Besser für Deutschland.' });
  const [status] = await libraryStatus(ctx.db, [source(), source({ key: 'fehlt' })]).then((s) => s.slice(0, 1));
  assert.equal(status.program.status, 'ready');
  const missing = (await libraryStatus(ctx.db, [source({ key: 'fehlt' })]))[0];
  assert.equal(missing.program, null);
  await ctx.db.close();
});

test('a programme imported by hand is adopted, not downloaded twice', async () => {
  const { ctx, web } = await setup({ 'https://www.spd.de/alt.pdf': await makePdf([PAGE, PAGE, PAGE]) });
  await ctx.db.query(`insert into programs (slug, party, title, kind, status) values ('gruene-hand', 'Grüne', 'Von Hand', 'wahlprogramm', 'ready')`);
  const gruene = source({ key: 'test-gruene', party: 'Bündnis 90/Die Grünen', urls: ['https://www.gruene.de/x.pdf'], domains: ['gruene.de'] });
  const report = await importDefaultPrograms(ctx, { sources: [gruene, source()] });
  assert.deepEqual(report.adopted, ['test-gruene']);
  assert.deepEqual(report.imported, ['test-spd']);
  assert.ok(!web.calls.some((c) => c.url.includes('gruene.de')), 'nothing downloaded for the adopted one');
  assert.equal((await ctx.db.one(`select source_key from programs where slug = 'gruene-hand'`)).source_key, 'test-gruene');
  assert.equal((await ctx.db.one(`select count(*)::int as n from programs where kind = 'wahlprogramm'`)).n, 2);
  await ctx.db.close();
});

test('the clock fills the library before anything else', async () => {
  const { ctx } = await setup({ 'https://www.spd.de/alt.pdf': await makePdf([PAGE, PAGE, PAGE]) });
  ctx.config = { ...ctx.config, defaultLibrary: true };
  ctx.librarySources = [source()];
  ctx.mailer = { configured: false };
  const report = await tick(ctx, { now: new Date('2026-09-25T08:00:00Z') });
  assert.deepEqual(report.library.imported, ['test-spd']);
  const quiet = await tick(ctx, { now: new Date('2026-09-25T08:15:00Z') });
  assert.equal(quiet.library, null, 'nothing to do once everything is there');
  await ctx.db.close();
});

test('page and text checks', () => {
  const src = source();
  assert.doesNotThrow(() => checkProgramPdf([PAGE.join(' '), PAGE.join(' '), PAGE.join(' ')], src));
  assert.throws(() => checkProgramPdf(['', '', ''], src), /Scan/);
  assert.throws(() => checkProgramPdf([PAGE.join(' ')], src), /nur 1 Seiten/);
  // Hyphenation across lines does not hide the title.
  assert.doesNotThrow(() => checkProgramPdf([`Regierungs-\nprogramm ${OTHER.join(' ')}`, OTHER.join(' '), OTHER.join(' ')], src));
});

test('domains and version filters', () => {
  assert.ok(onDomains('https://cms.gruene.de/uploads/a.pdf', ['gruene.de']));
  assert.ok(onDomains('https://gruene.de/a.pdf', ['gruene.de']));
  assert.ok(!onDomains('https://evilgruene.de/a.pdf', ['gruene.de']));
  assert.ok(!onDomains('kein link', ['gruene.de']));
  for (const u of ['Kurzwahlprogramm.pdf', 'Wahlprogramm_einfacheSpr.pdf', '20250205_Wahlprogramm-LS_A4.pdf', 'Bundestagswahlprogramm_LP_SPD_2025.pdf', 'Entwurf_Regierungsprogramm.pdf', 'Leitantrag.pdf']) {
    assert.ok(NOT_THE_FULL_VERSION.test(u), u);
  }
  for (const u of ['km_btw_2025_wahlprogramm_langfassung_ansicht.pdf', 'Regierungsprogramm_DIGITAL_DINA5.pdf', 'AfD_Bundestagswahlprogramm2025_web.pdf', 'Wahlprogramm_Langfassung_Linke-BTW25_01.pdf', '2025_SPD_Regierungsprogramm.pdf', 'KoaV-2025-Gesamt-final-0424.pdf']) {
    assert.ok(!NOT_THE_FULL_VERSION.test(u), u);
  }
});

test('the standard library covers every group in the Bundestag and the coalition agreement', () => {
  const keys = DEFAULT_PROGRAMS.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length, 'keys are unique');
  for (const party of ['AfD', 'Bündnis 90/Die Grünen', 'CDU/CSU', 'Die Linke', 'SPD']) {
    assert.ok(DEFAULT_PROGRAMS.some((p) => p.party === party && p.kind === 'wahlprogramm'), party);
  }
  assert.ok(DEFAULT_PROGRAMS.some((p) => p.kind === 'koalitionsvertrag'));
  for (const p of DEFAULT_PROGRAMS) {
    assert.ok(p.urls.length && p.urls.every((u) => onDomains(u, p.domains) && u.endsWith('.pdf')), `${p.key}: urls on its own domains`);
    assert.ok(p.expect.length && p.minPages >= 20, p.key);
  }
});
