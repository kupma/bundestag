import assert from 'node:assert/strict';
import test from 'node:test';

import { ARTICLE_VERSION, checkVotes, generateArticle, outdatedArticles, pendingDates } from '../src/articles.js';
import { syncDecisions } from '../src/dip.js';
import { formatRangeDe, lastSunday, letterDue, mailWeek, weekOf } from '../src/newsletter.js';
import { tick } from '../src/scheduler.js';
import { fakeClaude, fakeDip, fakeMailer, makeConfig, makeDb, samplePositions } from './helpers.js';

// The Claude calls made since `from`, by kind.
function callsSince(claude, from) {
  const calls = claude.calls.slice(from);
  return {
    analyses: calls.filter((c) => c.schema.required.includes('votes')),
    frames: calls.filter((c) => c.schema.required.includes('lede')),
  };
}

async function setup() {
  const db = await makeDb();
  const ctx = { db, config: makeConfig({ settleHours: 0 }), claude: fakeClaude(), dip: fakeDip(), mailer: fakeMailer() };
  await syncDecisions(ctx, { start: '2026-09-20', end: '2026-09-25' });
  return ctx;
}

test('generateArticle writes a checked, structured article', async () => {
  const ctx = await setup();
  const result = await generateArticle(ctx, '2026-09-24');
  assert.equal(result.slug, '2026-09-24');

  const article = await ctx.db.one('select * from articles where slug = $1', ['2026-09-24']);
  assert.equal(article.title, 'Mietpreisbremse bleibt bis 2029');
  assert.equal(article.model, 'fake-model');
  const body = article.body;
  assert.equal(body.version, ARTICLE_VERSION);
  assert.equal(body.decisions.length, 2, 'bill and motion in depth');
  assert.equal(body.others.length, 1, 'petitions on the short list');
  assert.match(body.others[0].title, /Sammelübersicht/);
  assert.deepEqual(body.intro, ['Absatz eins.', 'Absatz zwei.']);

  assert.equal(body.commonGround, 'Beim Mieterschutz stimmte eine breite Mehrheit zu.');

  const bill = body.decisions.find((d) => d.title.includes('Mietpreisbremse'));
  assert.equal(bill.votesNote, 'CDU/CSU und SPD dafür, AfD dagegen.');
  assert.deepEqual(bill.positions, ['2. Beratung', '3. Beratung'], 'both readings, so the bill was passed that day');
  // Suggestions: at most two, known levels only, links only from the curated
  // list – and none of the general ones that would fit under any decision.
  assert.deepEqual(bill.actions, [
    { level: 'alltag', text: 'Prüfe mit dem Mietspiegel, ob deine Miete zulässig ist.', resource: 'mieterbund' },
    { level: 'gemeinsam', text: 'Sprich mit deinen Nachbarn über ihre Erfahrungen.', resource: null },
  ]);
  const analysis = ctx.claude.calls.find((c) => c.schema.required.includes('votes'));
  const offered = analysis.schema.properties.actions.items.properties.resource.enum;
  assert.ok(offered.includes('mieterbund'));
  assert.ok(!offered.includes('abgeordnete') && !offered.includes('petition'), 'general participation links are not offered');
  assert.ok(bill.sources.some((s) => s.label === 'Plenarprotokoll 21/45'));
  assert.ok(bill.sources.some((s) => s.label.startsWith('Drucksache 21/1234')));
  // Every group once, in the order they sit; a vote that is none, or a group
  // the model left out, stays unknown.
  assert.deepEqual(bill.votes, [
    { fraktion: 'Linke', vote: 'unbekannt' },
    { fraktion: 'Grüne', vote: 'unbekannt' },
    { fraktion: 'SPD', vote: 'dafür' },
    { fraktion: 'CDU/CSU', vote: 'dafür' },
    { fraktion: 'AfD', vote: 'dagegen' },
  ]);
  assert.equal(bill.parties, undefined, 'no programme verdicts any more');
  assert.equal(body.checks, undefined);
  const cites = await ctx.db.one('select count(*)::int as n from article_citations');
  assert.equal(cites.n, 0);

  // The protocol's vote sentences reached the model for the bill.
  const analysisPrompt = ctx.claude.calls.find((c) => c.schema.required.includes('votes') && c.prompt.includes('Mietpreisbremse')).prompt;
  assert.match(analysisPrompt, /mit den Stimmen der Fraktionen der CDU\/CSU und SPD/);
  assert.match(analysisPrompt, /A\. Problem und Ziel/);
  assert.doesNotMatch(analysisPrompt, /<programm|Wahlprogramm/);

  // Details are stored so the next run does not refetch them.
  const d = await ctx.db.one(`select details from decisions where vorgang_id = '318001'`);
  assert.match(d.details.votes, /angenommen/);
  await ctx.db.close();
});

test('an existing article is left alone unless forced', async () => {
  const ctx = await setup();
  await generateArticle(ctx, '2026-09-24');
  const calls = ctx.claude.calls.length;
  assert.equal((await generateArticle(ctx, '2026-09-24')).skipped, 'exists');
  assert.equal(ctx.claude.calls.length, calls, 'no tokens spent');
  await generateArticle(ctx, '2026-09-24', { force: true });
  assert.equal(ctx.claude.calls.length, 2 * calls, 'forced without reuse: everything anew');
  assert.equal((await ctx.db.one('select count(*)::int as n from articles')).n, 1);
  await ctx.db.close();
});

test('a rewrite with nothing new keeps the article and spends no tokens', async () => {
  const ctx = await setup();
  await generateArticle(ctx, '2026-09-24');
  const before = await ctx.db.one('select title, lede, body, usage from articles');
  const calls = ctx.claude.calls.length;

  const logs = [];
  const result = await generateArticle(ctx, '2026-09-24', { force: true, reuse: true, log: (l) => logs.push(l) });
  assert.equal(ctx.claude.calls.length, calls, 'no Claude call');
  assert.deepEqual(result.usage, { input: 0, output: 0, calls: 0 });
  const after = await ctx.db.one('select title, lede, body, usage from articles');
  assert.equal(after.title, before.title);
  assert.equal(after.lede, before.lede);
  assert.deepEqual(after.body, before.body);
  assert.ok(logs.some((l) => /2 Analysen unverändert übernommen, 0 neu/.test(l)));
  // The admin table adds up all versions.
  assert.deepEqual(after.usage, { ...before.usage, runs: 2 });
  await ctx.db.close();
});

test('no article without Claude or without decisions', async () => {
  const ctx = await setup();
  await assert.rejects(generateArticle({ ...ctx, claude: null }, '2026-09-24'), /ANTHROPIC_API_KEY/);
  await assert.rejects(generateArticle(ctx, '2026-09-23'), /keine Beschlüsse/);
  await ctx.db.close();
});

test('checkVotes keeps unknown votes honest', () => {
  const all = (vote) => ['Linke', 'Grüne', 'SPD', 'CDU/CSU', 'AfD'].map((fraktion) => ({ fraktion, vote }));
  assert.deepEqual(checkVotes(null), all('unbekannt'));
  assert.deepEqual(checkVotes(all('dafür'), { known: false }), all('unbekannt'), 'no protocol, no votes');
  const twice = checkVotes([{ fraktion: 'AfD', vote: 'dagegen' }, { fraktion: 'AfD', vote: 'dafür' }, { fraktion: 'FDP', vote: 'dafür' }]);
  assert.deepEqual(twice.map((v) => v.fraktion), ['Linke', 'Grüne', 'SPD', 'CDU/CSU', 'AfD'], 'only the groups in the hall');
  assert.equal(twice[4].vote, 'dagegen', 'the first answer counts');
});

test('pendingDates waits until a sitting day has stopped changing', async () => {
  const ctx = await setup();
  assert.deepEqual(await pendingDates(ctx.db, { from: '2026-09-20', to: '2026-09-25', settleHours: 0 }), ['2026-09-24']);
  assert.deepEqual(await pendingDates(ctx.db, { from: '2026-09-20', to: '2026-09-25', settleHours: 6 }), [], 'just fetched, not settled');
  await generateArticle(ctx, '2026-09-24');
  assert.deepEqual(await pendingDates(ctx.db, { from: '2026-09-20', to: '2026-09-25', settleHours: 0 }), []);
  await ctx.db.close();
});

const subscribe = (ctx, email, newsletter = true, verified = true) =>
  ctx.db.query(
    `insert into users (email, display_name, password_hash, newsletter, email_verified_at, unsubscribe_token) values ($1, 'N', 'x', $2, $3, $1)`,
    [email, newsletter, verified ? new Date() : null],
  );

test('weeks run Monday to Sunday and are named by their Sunday', () => {
  assert.deepEqual(weekOf('2026-09-24'), { from: '2026-09-21', to: '2026-09-27' });
  assert.deepEqual(weekOf('2026-09-21'), { from: '2026-09-21', to: '2026-09-27' });
  assert.deepEqual(weekOf('2026-09-27'), { from: '2026-09-21', to: '2026-09-27' });
  assert.equal(lastSunday('2026-09-27'), '2026-09-27');
  assert.equal(lastSunday('2026-09-24'), '2026-09-20');
  assert.equal(formatRangeDe('2026-09-23', '2026-09-25'), '23. bis 25. September 2026');
  assert.equal(formatRangeDe('2026-09-30', '2026-10-02'), '30. September bis 2. Oktober 2026');
});

test('the weekly letter goes to confirmed subscribers only, and only once', async () => {
  const ctx = await setup();
  const { articleId } = await generateArticle(ctx, '2026-09-24');
  await subscribe(ctx, 'yes@example.de');
  await subscribe(ctx, 'unconfirmed@example.de', true, false);
  await subscribe(ctx, 'no@example.de', false);

  const first = await mailWeek(ctx, '2026-09-27', { pauseMs: 0 });
  assert.deepEqual(first, { week: '2026-09-27', days: 1, sent: 1, failed: 0 });
  const letter = ctx.mailer.sent[0];
  assert.equal(letter.to, 'yes@example.de');
  assert.equal(letter.subject, 'Die Sitzung vom 24. September 2026 – Wahlwort');
  assert.match(letter.text, /Mietpreisbremse bleibt/);
  assert.match(letter.text, /http:\/\/localhost:3999\/artikel\/2026-09-24\?utm_source=newsletter/);
  assert.match(letter.unsubscribeUrl, /\/newsletter\/abmelden\?t=yes%40example\.de$/);
  assert.doesNotMatch(letter.html, /<script/);
  assert.match(letter.text, /Gemeinsamkeiten: Beim Mieterschutz/);
  assert.match(letter.text, /Was du tun kannst:\n– Prüfe mit dem Mietspiegel/);
  assert.match(letter.text, /Mietervereine vor Ort: https:\/\/www\.mieterbund\.de/);
  assert.match(letter.html, /Was du tun kannst/);

  assert.equal((await mailWeek(ctx, '2026-09-27', { pauseMs: 0 })).sent, 0);
  assert.equal(ctx.mailer.sent.length, 1);
  assert.ok((await ctx.db.one('select mailed_at from articles where id = $1', [articleId])).mailed_at);
  assert.equal(await letterDue(ctx.db, '2026-09-27'), false);
  await ctx.db.close();
});

test('one letter covers every sitting day of the week', async () => {
  const ctx = await setupWith({ positions: [...samplePositions('2026-09-23'), ...samplePositions('2026-09-24')] });
  await syncDecisions(ctx, { start: '2026-09-20', end: '2026-09-25' });
  await generateArticle(ctx, '2026-09-23');
  await generateArticle(ctx, '2026-09-24');
  await subscribe(ctx, 's@example.de');
  const r = await mailWeek(ctx, '2026-09-27', { pauseMs: 0 });
  assert.equal(r.days, 2);
  const [letter] = ctx.mailer.sent;
  assert.equal(letter.subject, 'Die Sitzungswoche vom 23. bis 24. September 2026 – Wahlwort');
  assert.ok(letter.text.indexOf('MITTWOCH, 23. SEPTEMBER 2026') < letter.text.indexOf('DONNERSTAG, 24. SEPTEMBER 2026'), 'in the order of the week');
  assert.match(letter.html, /artikel\/2026-09-23\?utm_source=newsletter/);
  assert.match(letter.html, /artikel\/2026-09-24\?utm_source=newsletter/);
  assert.equal(letter.text.match(/Prüfe mit dem Mietspiegel/g).length, 1, 'the same step once');
  assert.equal(ctx.mailer.sent.length, 1);
  // A week without a sitting sends nothing.
  assert.deepEqual(await mailWeek(ctx, '2026-10-04', { pauseMs: 0 }), { sent: 0, failed: 0 });
  await ctx.db.close();
});

test('tick fetches and writes one article, and a second tick does nothing new', async () => {
  const ctx = await setup();
  await subscribe(ctx, 's@example.de');
  // 10:00 in Berlin, the day after the sitting.
  const now = new Date('2026-09-25T08:00:00Z');
  const report = await tick(ctx, { now, forceSync: true });
  assert.ok(report.sync, 'synced');
  assert.deepEqual(report.generated, [{ date: '2026-09-24', slug: '2026-09-24' }]);
  assert.equal(report.mailed, null, 'the letter waits for Sunday');
  assert.equal(ctx.mailer.sent.length, 0);

  const again = await tick(ctx, { now, forceSync: true });
  assert.deepEqual(again.generated, []);

  const jobs = await ctx.db.query('select kind, ok from job_runs order by id');
  assert.ok(jobs.rows.some((j) => j.kind === 'article:2026-09-24' && j.ok));
  await ctx.db.close();
});

test('the letter goes out on Sunday from NEWSLETTER_HOUR, once', async () => {
  const ctx = await setup();
  await subscribe(ctx, 's@example.de');
  await tick(ctx, { now: new Date('2026-09-25T08:00:00Z'), forceSync: true });
  assert.equal((await tick(ctx, { now: new Date('2026-09-26T08:00:00Z') })).mailed, null, 'not on Saturday');
  // Sunday, 07:00 and 09:00 in Berlin
  assert.equal((await tick(ctx, { now: new Date('2026-09-27T05:00:00Z') })).mailed, null, 'not before 8');
  const sunday = await tick(ctx, { now: new Date('2026-09-27T07:00:00Z') });
  assert.deepEqual(sunday.mailed, { week: '2026-09-27', days: 1, sent: 1, failed: 0 });
  assert.equal(ctx.mailer.sent.length, 1);
  assert.equal((await tick(ctx, { now: new Date('2026-09-27T07:15:00Z') })).mailed, null, 'once');
  // The next Sunday: no sitting that week, no letter.
  assert.equal((await tick(ctx, { now: new Date('2026-10-04T07:00:00Z') })).mailed, null);
  assert.equal(ctx.mailer.sent.length, 1);
  await ctx.db.close();
});

test('tick stays quiet at night and never writes about today', async () => {
  const ctx = await setup();
  // 03:00 in Berlin: fetch yes, write no.
  const night = await tick(ctx, { now: new Date('2026-09-25T01:00:00Z'), forceSync: true });
  assert.deepEqual(night.generated, []);
  // The sitting day itself, in the afternoon: still no article about it.
  const sameDay = await tick(ctx, { now: new Date('2026-09-24T14:00:00Z'), forceSync: true });
  assert.deepEqual(sameDay.generated, []);
  await ctx.db.close();
});

test('a refused decision drops out of the article instead of sinking it', async () => {
  const ctx = await setup();
  const good = ctx.claude;
  ctx.claude = {
    model: 'fake-model',
    calls: good.calls,
    async json(req) {
      if (req.schema.required.includes('votes') && req.prompt.includes('Titel: Kostenloses Mittagessen')) {
        throw new Error('Claude hat die Anfrage abgelehnt (test).');
      }
      return good.json(req);
    },
  };
  const logs = [];
  await generateArticle(ctx, '2026-09-24', { log: (l) => logs.push(l) });
  const { body } = await ctx.db.one(`select body from articles where slug = '2026-09-24'`);
  assert.equal(body.decisions.length, 1);
  assert.ok(body.others.some((o) => o.title === 'Kostenloses Mittagessen an allen Schulen'), 'still listed briefly');
  assert.ok(logs.some((l) => /fehlgeschlagen/.test(l)));
  await ctx.db.close();
});

test('three failures in a day stop the retries for that date', async () => {
  const ctx = await setup();
  let calls = 0;
  ctx.claude = { model: 'broken', json: async () => { calls++; throw new Error('kaputt'); } };
  const now = new Date('2026-09-25T08:00:00Z');
  for (let i = 0; i < 5; i++) await tick(ctx, { now });
  assert.equal(calls, 3 * 2, 'three attempts, one call per decision');
  const runs = await ctx.db.query(`select ok from job_runs where kind = 'article:2026-09-24'`);
  assert.deepEqual(runs.rows.map((r) => r.ok), [false, false, false]);
  await ctx.db.close();
});

// --- timing: fresh deploys, late DIP data, late protocols -------------------------

async function setupWith({ positions, protocol, config = {} }) {
  const ctx = await setup();
  ctx.dip = fakeDip({ positions, protocol });
  ctx.config = { ...ctx.config, ...config };
  return ctx;
}

test('a sitting day two days back counts as complete even when just fetched', async () => {
  const ctx = await setupWith({ positions: [...samplePositions('2026-09-23'), ...samplePositions('2026-09-24')] });
  await syncDecisions(ctx, { start: '2026-09-20', end: '2026-09-25' });
  const args = { from: '2026-09-15', to: '2026-09-24', settleHours: 12 };
  assert.deepEqual(await pendingDates(ctx.db, args), [], 'without the rule nothing is settled yet');
  assert.deepEqual(await pendingDates(ctx.db, { ...args, settledBefore: '2026-09-23' }), ['2026-09-23']);
  await ctx.db.close();
});

test('the first run writes the latest sitting week, not everything it finds', async () => {
  const positions = ['2026-09-01', '2026-09-09', '2026-09-10', '2026-09-11'].flatMap((d) => samplePositions(d));
  const ctx = await setupWith({ positions, config: { settleHours: 12 } });
  await ctx.db.query(`insert into users (email, display_name, password_hash, newsletter, email_verified_at, unsubscribe_token) values ('s@example.de', 'S', 'x', true, now(), 't1')`);
  await ctx.db.query('delete from decisions');
  const report = await tick(ctx, { now: new Date('2026-09-25T08:00:00Z'), forceSync: true });
  assert.ok(report.sync, 'fetched a wider window on the first run');
  assert.deepEqual(report.generated.map((g) => g.date), ['2026-09-09', '2026-09-10', '2026-09-11']);
  assert.equal(ctx.mailer.sent.length, 0, 'old sitting days are not mailed');
  // From now on it is one article per tick again, within the normal window.
  const next = await tick(ctx, { now: new Date('2026-09-25T08:15:00Z'), forceSync: true });
  assert.deepEqual(next.generated, []);
  await ctx.db.close();
});

test('an article is rewritten when DIP adds decisions for its day', async () => {
  let positions = samplePositions('2026-09-24').filter((p) => p.vorgang_id !== '318002');
  const ctx = await setup();
  ctx.dip = { ...fakeDip(), positions: async () => positions };
  ctx.config = { ...ctx.config, settleHours: 0 };
  await ctx.db.query('delete from decisions');
  await syncDecisions(ctx, { start: '2026-09-20', end: '2026-09-25' });
  const { articleId } = await generateArticle(ctx, '2026-09-24');
  const before = await ctx.db.one('select created_at, body from articles where id = $1', [articleId]);
  assert.equal(before.body.decisions.length, 1);

  positions = samplePositions('2026-09-24'); // DIP now also has the motion
  const calls = ctx.claude.calls.length;
  const report = await tick(ctx, { now: new Date('2026-09-25T10:00:00Z'), forceSync: true });
  assert.deepEqual(report.refreshed.map(({ date, why }) => ({ date, why })), [{ date: '2026-09-24', why: 'neue Beschlüsse in DIP' }]);
  const after = await ctx.db.one('select id, created_at, published_at, body from articles where sitting_date = $1', ['2026-09-24']);
  assert.equal(after.id, articleId, 'same article, comments stay');
  assert.equal(after.body.decisions.length, 2);
  assert.ok(new Date(after.created_at) > new Date(before.created_at));

  // Only the new decision went to Claude; the bill's analysis was kept.
  const since = callsSince(ctx.claude, calls);
  assert.equal(since.analyses.length, 1);
  assert.match(since.analyses[0].prompt, /Titel: Kostenloses Mittagessen/);
  assert.equal(since.frames.length, 1, 'the introduction now covers two decisions');
  const bill = (body) => body.decisions.find((s) => s.title.includes('Mietpreisbremse'));
  assert.deepEqual(bill(after.body), bill(before.body));

  const quiet = await tick(ctx, { now: new Date('2026-09-25T10:15:00Z'), forceSync: true });
  assert.deepEqual(quiet.refreshed, [], 'no loop');
  await ctx.db.close();
});

test('an article written before the protocol is rewritten once the votes are published', async () => {
  const dip = fakeDip({ protocol: null });
  const ctx = await setup();
  ctx.dip = dip;
  await ctx.db.query(`insert into users (email, display_name, password_hash, newsletter, email_verified_at, unsubscribe_token) values ('s@example.de', 'S', 'x', true, now(), 't1')`);
  const first = await tick(ctx, { now: new Date('2026-09-25T08:00:00Z'), forceSync: true });
  assert.deepEqual(first.generated.map((g) => g.date), ['2026-09-24']);
  const before = (await ctx.db.one('select body from articles')).body;
  assert.equal(before.protocolAvailable, false);
  assert.ok(before.decisions.every((d) => d.votes.every((v) => v.vote === 'unbekannt')), 'no protocol, no votes');

  const stillMissing = await tick(ctx, { now: new Date('2026-09-25T09:10:00Z'), forceSync: true });
  assert.deepEqual(stillMissing.refreshed, [], 'no rewrite while the protocol is missing');

  const withProtocol = { ...fakeDip(), calls: [] };
  ctx.dip = withProtocol;
  const calls = ctx.claude.calls.length;
  const report = await tick(ctx, { now: new Date('2026-09-25T10:20:00Z'), forceSync: true });
  assert.deepEqual(report.refreshed.map(({ date, why }) => ({ date, why })), [{ date: '2026-09-24', why: 'Plenarprotokoll jetzt verfügbar' }]);
  // The votes are new input for every decision, so every decision is analysed again.
  const { analyses } = callsSince(ctx.claude, calls);
  assert.equal(analyses.length, 2);
  assert.ok(analyses.every((a) => /mit den Stimmen der Fraktion/.test(a.prompt)));
  const body = (await ctx.db.one('select body from articles')).body;
  assert.equal(body.protocolAvailable, true);
  const bill = body.decisions.find((d) => d.title.includes('Mietpreisbremse'));
  assert.equal(bill.votes.find((v) => v.fraktion === 'SPD').vote, 'dafür');
  await ctx.db.close();
});

test("yesterday's sitting is written the next morning, even while DIP is still adding to it", async () => {
  const ctx = await setup();
  ctx.config = { ...ctx.config, settleHours: 12 };
  await ctx.db.query('delete from decisions');
  ctx.dip = fakeDip({ positions: samplePositions('2026-09-25') });
  const early = await tick(ctx, { now: new Date('2026-09-26T03:00:00Z'), forceSync: true });
  assert.deepEqual(early.generated, [], 'not before 06:00 Berlin time');
  const morning = await tick(ctx, { now: new Date('2026-09-26T06:30:00Z'), forceSync: true });
  assert.deepEqual(morning.generated.map((g) => g.date), ['2026-09-25'], 'just fetched, but it is the next morning');
  await ctx.db.close();
});

test('an article from an older version of the pipeline is written anew, one per tick', async () => {
  const ctx = await setupWith({ positions: [...samplePositions('2026-09-23'), ...samplePositions('2026-09-24')] });
  await syncDecisions(ctx, { start: '2026-09-20', end: '2026-09-25' });
  await generateArticle(ctx, '2026-09-23');
  await generateArticle(ctx, '2026-09-24');
  assert.deepEqual(await outdatedArticles(ctx.db), []);

  // What the first version stored: programme verdicts, no version, no votes.
  await ctx.db.query(`update articles set body = (body - 'version') || '{"intro": ["Alt."]}'::jsonb`);
  assert.deepEqual(await outdatedArticles(ctx.db), ['2026-09-24', '2026-09-23'], 'newest first');

  const calls = ctx.claude.calls.length;
  const report = await tick(ctx, { now: new Date('2026-09-25T10:00:00Z'), forceSync: true });
  assert.deepEqual(report.refreshed.map(({ date, why }) => ({ date, why })), [{ date: '2026-09-24', why: 'neu geschrieben (ältere Fassung)' }]);
  const { analyses, frames } = callsSince(ctx.claude, calls);
  assert.equal(analyses.length, 2, 'every decision anew, nothing reused');
  assert.equal(frames.length, 1);
  const fresh = (await ctx.db.one(`select body from articles where slug = '2026-09-24'`)).body;
  assert.equal(fresh.version, ARTICLE_VERSION);
  assert.deepEqual(fresh.intro, ['Absatz eins.', 'Absatz zwei.']);
  assert.deepEqual(await outdatedArticles(ctx.db), ['2026-09-23']);

  await tick(ctx, { now: new Date('2026-09-25T10:15:00Z'), forceSync: true });
  assert.deepEqual(await outdatedArticles(ctx.db), []);
  await ctx.db.close();
});
