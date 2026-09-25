import assert from 'node:assert/strict';
import test from 'node:test';

import { checkAnalysis, generateArticle, pendingDates } from '../src/articles.js';
import { syncDecisions } from '../src/dip.js';
import { mailArticle } from '../src/newsletter.js';
import { createProgram, ingestProgramPdf } from '../src/programs.js';
import { tick } from '../src/scheduler.js';
import { fakeClaude, fakeDip, fakeMailer, makeConfig, makeDb, makePdf, samplePositions } from './helpers.js';

async function setup({ programs = true } = {}) {
  const db = await makeDb();
  const ctx = { db, config: makeConfig({ settleHours: 0 }), claude: fakeClaude(), dip: fakeDip(), embedder: null, mailer: fakeMailer() };
  if (programs) {
    const docs = [
      ['SPD', 'wahlprogramm', ['Wir werden die Mietpreisbremse verlängern und Mieterinnen und Mieter schützen.', 'Kostenloses Mittagessen in allen Schulen.']],
      ['CDU/CSU', 'wahlprogramm', ['Mieten: Wir setzen auf Neubau. Die Mietpreisbremse lassen wir auslaufen.', 'Schulessen ist Sache der Länder.']],
      ['Die Linke', 'wahlprogramm', ['Mietendeckel statt Mietpreisbremse: Mieten einfrieren.', 'Mittagessen gratis für alle Kinder in Schule und Kita.']],
      ['CDU/CSU und SPD', 'koalitionsvertrag', ['Die Mietpreisbremse wird um vier Jahre verlängert.']],
    ];
    for (const [party, kind, pages] of docs) {
      const p = await createProgram(db, { party, title: 'Programm', kind, election: '2025', sourceUrl: `https://example.org/${encodeURIComponent(party)}.pdf` });
      await ingestProgramPdf({ db }, p.id, await makePdf(pages.map((t) => [t])));
    }
  }
  await syncDecisions(ctx, { start: '2026-09-20', end: '2026-09-25' });
  return ctx;
}

test('generateArticle writes a checked, structured article', async () => {
  const ctx = await setup();
  const result = await generateArticle(ctx, '2026-09-24');
  assert.equal(result.slug, '2026-09-24');

  const article = await ctx.db.one('select * from articles where slug = $1', ['2026-09-24']);
  assert.equal(article.title, 'Mietpreisbremse bleibt – wie versprochen?');
  assert.equal(article.model, 'fake-model');
  const body = article.body;
  assert.equal(body.decisions.length, 2, 'bill and motion in depth');
  assert.equal(body.others.length, 1, 'petitions on the short list');
  assert.match(body.others[0].title, /Sammelübersicht/);
  assert.deepEqual(body.intro, ['Absatz eins.', 'Absatz zwei.']);

  assert.equal(body.commonGround, 'Beim Mieterschutz stimmte eine breite Mehrheit zu.');

  const bill = body.decisions.find((d) => d.title.includes('Mietpreisbremse'));
  assert.equal(bill.votesNote, 'CDU/CSU und SPD dafür, AfD dagegen.');
  // Suggestions: at most three, known levels only, links only from the curated list.
  assert.deepEqual(bill.actions, [
    { level: 'alltag', text: 'Prüfe mit dem Mietspiegel, ob deine Miete zulässig ist.', resource: 'mieterbund' },
    { level: 'politik', text: 'Frag deine Abgeordneten, wie es weitergeht.', resource: 'abgeordnete' },
    { level: 'gemeinsam', text: 'Sprich mit deinen Nachbarn über ihre Erfahrungen.', resource: null },
  ]);
  assert.ok(bill.sources.some((s) => s.label === 'Plenarprotokoll 21/45'));
  assert.ok(bill.sources.some((s) => s.label.startsWith('Drucksache 21/1234')));
  assert.equal(bill.parties.length, 4, 'every programme appears once');

  const [first, second, third, coalition] = bill.parties;
  // A valid citation with a real quote survives intact.
  assert.equal(first.alignment, 'entspricht');
  assert.equal(first.citations.length, 1);
  assert.ok(first.citations[0].quote.length > 0);
  assert.match(first.citations[0].url, /#page=\d+$/);
  // A quote that is not in the passage is dropped; the link stays.
  assert.equal(second.alignment, 'widerspricht');
  assert.equal(second.citations[0].quote, '');
  // A verdict citing a passage it was never shown is withdrawn.
  assert.equal(third.alignment, 'nicht_thematisiert');
  assert.deepEqual(third.citations, []);
  assert.match(third.assessment, /keine belegbare Aussage/);
  // The coalition agreement has no parliamentary group to vote.
  assert.equal(coalition.kind, 'koalitionsvertrag');
  assert.equal(coalition.vote, 'nicht_anwendbar');
  assert.ok(body.checks.droppedQuotes >= 1 && body.checks.withdrawn >= 1);

  // Citations are recorded for the reverse lookup ("zitiert in").
  const cites = await ctx.db.one('select count(*)::int as n from article_citations where article_id = $1', [article.id]);
  assert.ok(cites.n >= 2);

  // The protocol's vote sentences reached the model for the bill.
  const analysisPrompt = ctx.claude.calls.find((c) => c.schema.required.includes('parties') && c.prompt.includes('Mietpreisbremse')).prompt;
  assert.match(analysisPrompt, /mit den Stimmen der Fraktionen der CDU\/CSU und SPD/);
  assert.match(analysisPrompt, /A\. Problem und Ziel/);

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
  assert.equal((await ctx.db.one('select count(*)::int as n from articles')).n, 1);
  await ctx.db.close();
});

test('no article without programmes, without Claude, or without decisions', async () => {
  const ctx = await setup({ programs: false });
  await assert.rejects(generateArticle(ctx, '2026-09-24'), /Bibliothek enthält noch kein Wahlprogramm/);
  await assert.rejects(generateArticle({ ...ctx, claude: null }, '2026-09-24'), /ANTHROPIC_API_KEY/);
  await ctx.db.close();

  const full = await setup();
  await assert.rejects(generateArticle(full, '2026-09-23'), /keine Beschlüsse/);
  await full.db.close();
});

test('checkAnalysis keeps unknown votes honest', () => {
  const programs = [{ id: 1, party: 'SPD', title: 'P', slug: 's', kind: 'wahlprogramm', source_url: '' }];
  const passages = new Map([[1, [{ id: 10, page: 3, text: 'Wir wollen mehr Wohnungen bauen.' }]]]);
  const { parties } = checkAnalysis({ parties: [{ program_id: 1, vote: 'nicht_anwendbar', alignment: 'teilweise', assessment: 'x', citations: [{ passage_id: 10, quote: 'mehr Wohnungen bauen' }] }] }, programs, passages);
  assert.equal(parties[0].vote, 'unbekannt', 'a party programme always has a group that could vote');
  assert.equal(parties[0].citations[0].url, '', 'no source URL, no PDF link');
  const missing = checkAnalysis({ parties: [] }, programs, passages).parties[0];
  assert.equal(missing.alignment, 'nicht_thematisiert');
  assert.equal(missing.vote, 'unbekannt');
});

test('pendingDates waits until a sitting day has stopped changing', async () => {
  const ctx = await setup();
  assert.deepEqual(await pendingDates(ctx.db, { from: '2026-09-20', to: '2026-09-25', settleHours: 0 }), ['2026-09-24']);
  assert.deepEqual(await pendingDates(ctx.db, { from: '2026-09-20', to: '2026-09-25', settleHours: 6 }), [], 'just fetched, not settled');
  await generateArticle(ctx, '2026-09-24');
  assert.deepEqual(await pendingDates(ctx.db, { from: '2026-09-20', to: '2026-09-25', settleHours: 0 }), []);
  await ctx.db.close();
});

test('newsletter goes to confirmed subscribers only, and only once', async () => {
  const ctx = await setup();
  const { articleId } = await generateArticle(ctx, '2026-09-24');
  const add = (email, newsletter, verified) =>
    ctx.db.query(
      `insert into users (email, display_name, password_hash, newsletter, email_verified_at, unsubscribe_token) values ($1, 'N', 'x', $2, $3, $1)`,
      [email, newsletter, verified ? new Date() : null],
    );
  await add('yes@example.de', true, true);
  await add('unconfirmed@example.de', true, false);
  await add('no@example.de', false, true);

  const first = await mailArticle(ctx, articleId, { pauseMs: 0 });
  assert.deepEqual(first, { sent: 1, failed: 0 });
  const letter = ctx.mailer.sent[0];
  assert.equal(letter.to, 'yes@example.de');
  assert.match(letter.subject, /Mietpreisbremse bleibt/);
  assert.match(letter.text, /http:\/\/localhost:3999\/artikel\/2026-09-24/);
  assert.match(letter.unsubscribeUrl, /\/newsletter\/abmelden\?t=yes%40example\.de$/);
  assert.doesNotMatch(letter.html, /<script/);
  assert.match(letter.text, /Gemeinsamkeiten: Beim Mieterschutz/);
  assert.match(letter.text, /Was du tun kannst:\n– Prüfe mit dem Mietspiegel/);
  assert.match(letter.text, /Mietervereine vor Ort: https:\/\/www\.mieterbund\.de/);
  assert.match(letter.html, /Was du tun kannst/);

  assert.deepEqual(await mailArticle(ctx, articleId, { pauseMs: 0 }), { sent: 0, failed: 0 });
  assert.equal(ctx.mailer.sent.length, 1);
  assert.ok((await ctx.db.one('select mailed_at from articles where id = $1', [articleId])).mailed_at);
  await ctx.db.close();
});

test('tick fetches, writes one article, mails it – and a second tick does nothing new', async () => {
  const ctx = await setup();
  await ctx.db.query(`insert into users (email, display_name, password_hash, newsletter, email_verified_at, unsubscribe_token) values ('s@example.de', 'S', 'x', true, now(), 't1')`);
  // 10:00 in Berlin, the day after the sitting.
  const now = new Date('2026-09-25T08:00:00Z');
  const report = await tick(ctx, { now, forceSync: true });
  assert.ok(report.sync, 'synced');
  assert.deepEqual(report.generated, [{ date: '2026-09-24', slug: '2026-09-24' }]);
  assert.equal(report.mailed.length, 1);
  assert.equal(ctx.mailer.sent.length, 1);

  const again = await tick(ctx, { now, forceSync: true });
  assert.deepEqual(again.generated, []);
  assert.deepEqual(again.mailed, []);
  assert.equal(ctx.mailer.sent.length, 1);

  const jobs = await ctx.db.query('select kind, ok from job_runs order by id');
  assert.ok(jobs.rows.some((j) => j.kind === 'article:2026-09-24' && j.ok));
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
      if (req.schema.required.includes('parties') && req.prompt.includes('Titel: Kostenloses Mittagessen')) {
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
  assert.equal(calls, 3);
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
  const report = await tick(ctx, { now: new Date('2026-09-25T10:00:00Z'), forceSync: true });
  assert.deepEqual(report.refreshed, [{ date: '2026-09-24', why: 'neue Beschlüsse in DIP' }]);
  const after = await ctx.db.one('select id, created_at, published_at, body from articles where sitting_date = $1', ['2026-09-24']);
  assert.equal(after.id, articleId, 'same article, comments stay');
  assert.equal(after.body.decisions.length, 2);
  assert.ok(new Date(after.created_at) > new Date(before.created_at));

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
  assert.equal((await ctx.db.one('select body from articles')).body.protocolAvailable, false);
  assert.equal(ctx.mailer.sent.length, 1);

  const stillMissing = await tick(ctx, { now: new Date('2026-09-25T09:10:00Z'), forceSync: true });
  assert.deepEqual(stillMissing.refreshed, [], 'no rewrite while the protocol is missing');

  const withProtocol = { ...fakeDip(), calls: [] };
  ctx.dip = withProtocol;
  const report = await tick(ctx, { now: new Date('2026-09-25T10:20:00Z'), forceSync: true });
  assert.deepEqual(report.refreshed, [{ date: '2026-09-24', why: 'Plenarprotokoll jetzt verfügbar' }]);
  const body = (await ctx.db.one('select body from articles')).body;
  assert.equal(body.protocolAvailable, true);
  assert.equal(ctx.mailer.sent.length, 1, 'the newsletter is not sent again');
  await ctx.db.close();
});
