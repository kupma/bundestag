import assert from 'node:assert/strict';
import test from 'node:test';

import { generateArticle } from '../src/articles.js';
import { syncDecisions } from '../src/dip.js';
import { accessToken, captionOf, createInstagram, pendingPosts, postArticle, renewalDue, renewToken } from '../src/instagram.js';
import { tick } from '../src/scheduler.js';
import { fit, fonts, H, measure, slideCount, slideImage, slideSvg, W, wrap } from '../src/views/slides.js';
import { browser, fakeClaude, fakeDip, fakeMailer, makeConfig, makeDb, startApp } from './helpers.js';

// Instagram's Graph API as far as a post needs it, recording every request.
// `answers` replaces the answer for a path: [status, body], or 'no answer'.
function fakeGraph(answers = {}) {
  const calls = [];
  let containers = 0;
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const params = init.method === 'POST' ? Object.fromEntries(new URLSearchParams(init.body)) : Object.fromEntries(u.searchParams);
    const path = u.pathname.replace(/^\/v\d+\.\d+/, '');
    calls.push({ method: init.method, raw: u.pathname, path, params });
    let answer = answers[path] && answers[path](calls.length);
    if (answer === 'no answer') throw new TypeError('fetch failed');
    if (!answer) {
      if (path === '/refresh_access_token') answer = [200, { access_token: `renewed-${calls.length}`, token_type: 'bearer', expires_in: 5184000 }];
      else if (path === '/me') answer = [200, { id: 'app-scoped', user_id: '1784', username: 'wahlwort' }];
      else if (path === '/1784/media') answer = [200, { id: `c${++containers}` }];
      else if (path === '/1784/media_publish') answer = [200, { id: 'm1' }];
      else if (/^\/c\d+$/.test(path)) answer = [200, { status_code: 'FINISHED', id: path.slice(1) }];
      else if (path === '/m1') answer = [200, { permalink: 'https://www.instagram.com/p/abc123/', id: 'm1' }];
      else answer = [404, { error: { message: 'Unknown path', code: 100 } }];
    }
    return new Response(JSON.stringify(answer[1]), { status: answer[0], headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetch };
}

async function setup({ graph = fakeGraph(), protocol } = {}) {
  const db = await makeDb();
  const config = makeConfig({ settleHours: 0, baseUrl: 'https://wahlwort.example', instagram: { accessToken: 'token-from-env' } });
  const ctx = {
    db,
    config,
    claude: fakeClaude(),
    dip: fakeDip(protocol === undefined ? {} : { protocol }),
    mailer: fakeMailer(),
    instagram: createInstagram({ fetch: graph.fetch }),
  };
  await syncDecisions(ctx, { start: '2026-09-20', end: '2026-09-25' });
  return { ctx, graph };
}

const vote = (list) => ['Linke', 'Grüne', 'SPD', 'CDU/CSU', 'AfD'].map((fraktion, i) => ({ fraktion, vote: list[i] }));

function sampleArticle(decisions = 9) {
  return {
    id: 7,
    slug: '2026-10-16',
    sitting_date: '2026-10-16',
    created_at: new Date('2026-10-17T06:00:00Z'),
    title: 'Wehrdienst & Mieten: <neu> geregelt',
    lede: 'Der Bundestag hat zwei Gesetze beschlossen.',
    body: {
      commonGround: 'Bei der Fluthilfe waren sich alle einig.',
      decisions: Array.from({ length: decisions }, (_, i) => ({
        decisionId: i + 1,
        headline: `Beschluss Nummer ${i + 1}`,
        result: i % 2 ? 'abgelehnt' : 'angenommen',
        summary: i === 1 ? 'Sehr lang. '.repeat(300) : 'Kurz erklärt.',
        votes: i === 2 ? vote(['unbekannt', 'unbekannt', 'unbekannt', 'unbekannt', 'unbekannt']) : vote(['dagegen', 'enthalten', 'dafür', 'dafür', 'gespalten']),
        votesNote: '',
      })),
    },
  };
}

const config = makeConfig({ baseUrl: 'https://wahlwort.example' });

test('the carousel: a cover, one picture per decision (at most eight), an end', () => {
  const article = sampleArticle(9);
  assert.equal(slideCount(article), 10, 'Instagram takes ten');
  assert.equal(slideCount(sampleArticle(2)), 4);
  assert.equal(slideSvg(config, article, 0), null);
  assert.equal(slideSvg(config, article, 11), null);

  const cover = slideSvg(config, article, 1);
  assert.match(cover, />Wehrdienst &amp; Mieten:<\/text>.*>&lt;neu&gt; geregelt</, 'source text is escaped');
  assert.match(cover, /8 Beschlüsse, verständlich erklärt/, 'the cover counts the pictures that follow');
  assert.match(cover, /Sitzung des Bundestags vom Freitag, 16\. Oktober 2026/);

  const first = slideSvg(config, article, 2);
  assert.match(first, /Beschluss 1 von 8/);
  assert.match(first, />Angenommen</);
  assert.match(first, />Abstimmung</);
  // A vote's shape, not its colour: dashed for an abstention, dotted for a split.
  assert.match(first, /stroke-dasharray="10 7"[^>]*\/><text[^>]*>Enthaltung</);
  assert.match(first, /stroke-dasharray="0\.1 8"[^>]*\/><text[^>]*>uneinheitlich</);
  // A party's colour only in its dot.
  assert.equal(first.split('#e3000f').length - 1, 1);
  assert.match(first, /<circle[^>]*r="8" fill="#e3000f"/);

  // A summary too long for its picture ends in "…", and nothing runs off it.
  const long = slideSvg(config, article, 3);
  assert.match(long, / …<\/text>/);
  for (const y of long.matchAll(/<text[^>]* y="([\d.]+)"/g)) assert.ok(Number(y[1]) < H, `text at y=${y[1]}`);

  assert.doesNotMatch(slideSvg(config, article, 4), />Abstimmung</, 'no box without a known vote');
  const end = slideSvg(config, article, 10);
  assert.match(end, /Gemeinsamkeiten/);
  assert.match(end, /wahlwort\.example\/artikel\/2026-10-16/);
  assert.match(end, /Link in der Bio/);
});

test('text is wrapped to the width, a long word at the seam of a compound', () => {
  const { display, text } = fonts();
  assert.deepEqual(wrap(display, 'Bundeswehrbeschaffungsbeschleunigungsgesetz', 66, 904), ['Bundeswehrbeschaffungs-', 'beschleunigungsgesetz']);
  const sentence = 'In Gegenden mit angespanntem Wohnungsmarkt darf die Miete bei einer Wiedervermietung höchstens zehn Prozent über der ortsüblichen Vergleichsmiete liegen.';
  const lines = wrap(text, sentence, 36, 600);
  assert.ok(lines.length > 2);
  for (const line of lines) assert.ok(measure(text, line, 36) <= 600, line);
  assert.equal(lines.join(' '), sentence, 'nothing lost, nothing added');

  // The largest size that fits; a word is broken only if no size avoids it.
  assert.equal(fit(display, 'Kurz', { sizes: [80, 60], width: 904, maxLines: 1 }).size, 80);
  const cut = fit(text, sentence, { sizes: [36, 30], width: 600, maxLines: 2 });
  assert.equal(cut.size, 30);
  assert.equal(cut.lines.length, 2);
  assert.match(cut.lines[1], / …$/);
  // A letter the fonts lack goes without its accent or stroke; what has no
  // such letter goes altogether.
  for (const font of [display, text]) assert.deepEqual(wrap(font, 'Gdańsk\u00a0und Łódź → Warschau', 30, 904), ['Gdansk und Lódz Warschau']);
});

test('a picture is a 1080 × 1350 JPEG', async () => {
  const jpg = await slideImage(config, sampleArticle(2), 2);
  assert.deepEqual([...jpg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  const sof = jpg.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(sof > 0, 'a baseline JPEG');
  assert.deepEqual([jpg.readUInt16BE(sof + 7), jpg.readUInt16BE(sof + 5)], [W, H]);
  assert.equal(await slideImage(config, sampleArticle(2), 2), jpg, 'drawn once');
});

test('the caption: the day, its decisions, where to read on – within Instagram’s 2200 characters', async () => {
  const article = sampleArticle(3);
  const caption = captionOf(config, article);
  assert.match(caption, /^Wehrdienst & Mieten: <neu> geregelt\n\nDer Bundestag hat zwei Gesetze beschlossen\./);
  assert.match(caption, /Sitzung vom Freitag, 16\. Oktober 2026:\n• Beschluss Nummer 1 \(angenommen\)\n• Beschluss Nummer 2 \(abgelehnt\)/);
  assert.match(caption, /wahlwort\.example\/artikel\/2026-10-16 \(Link in der Bio\)/);
  assert.match(caption, /KI/);
  assert.match(caption, /#Bundestag/);

  const wordy = sampleArticle(8);
  for (const d of wordy.body.decisions) d.headline = 'Sehr lange Überschrift '.repeat(15);
  const fitted = captionOf(config, wordy);
  assert.ok(fitted.length <= 2200, `${fitted.length} characters`);
  assert.match(fitted, /#Bundestag #Politik$/, 'the list is shortened, not the end');
});

test('the clock posts an article once its votes are known – once', async () => {
  const { ctx, graph } = await setup();
  await generateArticle(ctx, '2026-09-24');
  // 10:00 in Berlin, the day after the sitting.
  const report = await tick(ctx, { now: new Date('2026-09-25T08:00:00Z') });
  assert.deepEqual(report.posted, [{ date: '2026-09-24', id: 'm1', url: 'https://www.instagram.com/p/abc123/' }]);

  const calls = graph.calls.map((c) => `${c.method} ${c.path}`);
  assert.deepEqual(calls, [
    'GET /refresh_access_token',
    'GET /me',
    'POST /1784/media',
    'POST /1784/media',
    'POST /1784/media',
    'POST /1784/media',
    'POST /1784/media',
    'GET /c5',
    'POST /1784/media_publish',
    'GET /m1',
  ]);
  assert.equal(graph.calls[0].raw, '/refresh_access_token', 'renewed without a version');
  assert.match(graph.calls[1].raw, /^\/v\d+\.\d+\/me$/);
  assert.equal(graph.calls[0].params.access_token, 'token-from-env');
  assert.equal(graph.calls[1].params.access_token, 'renewed-1', 'then the renewed token');
  const pictures = graph.calls.slice(2, 6).map((c) => c.params);
  assert.deepEqual(pictures.map((p) => p.is_carousel_item), ['true', 'true', 'true', 'true']);
  pictures.forEach((p, i) => assert.match(p.image_url, new RegExp(`^https://wahlwort\\.example/instagram/2026-09-24/${i + 1}\\.jpg\\?v=[0-9a-z]+$`)));
  const carousel = graph.calls[6].params;
  assert.equal(carousel.media_type, 'CAROUSEL');
  assert.equal(carousel.children, 'c1,c2,c3,c4');
  assert.match(carousel.caption, /^Mietpreisbremse bleibt bis 2029/);
  assert.equal(graph.calls[8].params.creation_id, 'c5');

  const article = await ctx.db.one(`select instagram_at, instagram_url from articles where slug = '2026-09-24'`);
  assert.ok(article.instagram_at);
  assert.equal(article.instagram_url, 'https://www.instagram.com/p/abc123/');
  assert.equal((await ctx.db.one('select username from instagram_token')).username, 'wahlwort');

  const again = await tick(ctx, { now: new Date('2026-09-25T08:15:00Z') });
  assert.deepEqual(again.posted, []);
  assert.equal(graph.calls.length, 10, 'nothing more to Instagram');
  await ctx.db.close();
});

test('nothing goes out without the votes, at night, a week after the sitting, or when hidden', async () => {
  const { ctx, graph } = await setup({ protocol: null });
  await generateArticle(ctx, '2026-09-24');
  assert.deepEqual(await pendingPosts(ctx.db, { today: '2026-09-25' }), [], 'without the protocol every vote is unknown');

  await ctx.db.query(`update articles set body = jsonb_set(body, '{protocolAvailable}', 'true')`);
  assert.equal((await pendingPosts(ctx.db, { today: '2026-09-25' })).length, 1);
  assert.deepEqual(await pendingPosts(ctx.db, { today: '2026-10-02' }), [], 'more than a week back');
  const night = await tick(ctx, { now: new Date('2026-09-25T01:00:00Z') });
  assert.deepEqual(night.posted, []);
  assert.ok(!graph.calls.some((c) => c.path.endsWith('/media')), 'no post at 03:00');
  assert.ok(graph.calls.some((c) => c.path === '/refresh_access_token'), 'but the token is kept alive');
  await ctx.db.query(`update articles set status = 'hidden'`);
  assert.deepEqual(await pendingPosts(ctx.db, { today: '2026-09-25' }), []);
  await ctx.db.close();
});

test('turned down, an article waits for the next try; without an answer it never goes twice', async () => {
  let refuse = true;
  const { ctx } = await setup({
    graph: fakeGraph({ '/1784/media_publish': () => (refuse ? [400, { error: { message: 'Media ID is not available', code: 9007 } }] : null) }),
  });
  const { articleId } = await generateArticle(ctx, '2026-09-24');
  await assert.rejects(postArticle(ctx, articleId, { pauseMs: 0 }), /Instagram antwortete 400: Media ID is not available \(Code 9007\)/);
  assert.equal((await ctx.db.one('select instagram_at from articles where id = $1', [articleId])).instagram_at, null);
  refuse = false;
  assert.equal((await postArticle(ctx, articleId, { pauseMs: 0 })).id, 'm1');
  assert.deepEqual(await postArticle(ctx, articleId, { pauseMs: 0 }), { skipped: 'schon gepostet' });

  const lost = await setup({ graph: fakeGraph({ '/1784/media_publish': () => 'no answer' }) });
  const second = await generateArticle(lost.ctx, '2026-09-24');
  await assert.rejects(postArticle(lost.ctx, second.articleId, { pauseMs: 0 }), /nicht erreichbar/);
  assert.ok((await lost.ctx.db.one('select instagram_at from articles where id = $1', [second.articleId])).instagram_at, 'claimed, maybe posted');
  assert.deepEqual(await pendingPosts(lost.ctx.db, { today: '2026-09-25' }), []);

  // A carousel Instagram cannot put together is not published.
  const broken = await setup({ graph: fakeGraph({ '/c5': () => [200, { status_code: 'ERROR' }] }) });
  const third = await generateArticle(broken.ctx, '2026-09-24');
  await assert.rejects(postArticle(broken.ctx, third.articleId, { pauseMs: 0 }), /nicht fertig geworden \(ERROR\)/);
  assert.ok(!broken.graph.calls.some((c) => c.path.endsWith('/media_publish')));

  // Instagram fetches the pictures itself: a local address cannot work.
  broken.ctx.config = { ...broken.ctx.config, baseUrl: 'http://localhost:3000' };
  await assert.rejects(postArticle(broken.ctx, third.articleId), /öffentliche https-Adresse/);
  await Promise.all([ctx.db.close(), lost.ctx.db.close(), broken.ctx.db.close()]);
});

test('the token: from the environment, renewed weekly, replaced by a new one', async () => {
  let refuse = false;
  const graph = fakeGraph({ '/refresh_access_token': () => (refuse ? [400, { error: { message: 'Session has expired', code: 190 } }] : null) });
  const { ctx } = await setup({ graph });
  const now = new Date('2026-09-25T08:00:00Z');
  const days = (n) => new Date(now.getTime() + n * 86400000);
  assert.equal((await accessToken(ctx)).token, 'token-from-env');
  assert.equal(await renewalDue(ctx, { now }), true);

  const r = await renewToken(ctx, { now });
  assert.equal(r.expiresAt.toISOString(), days(60).toISOString());
  assert.equal((await accessToken(ctx)).token, 'renewed-1');
  assert.equal(await renewalDue(ctx, { now: days(6) }), false);
  assert.equal(await renewalDue(ctx, { now: days(8) }), true);

  // A failed renewal waits a day.
  refuse = true;
  await assert.rejects(renewToken(ctx, { now: days(8) }), /Session has expired/);
  assert.equal((await accessToken(ctx)).token, 'renewed-1');
  assert.equal(await renewalDue(ctx, { now: days(8.5) }), false);
  assert.equal(await renewalDue(ctx, { now: days(9.1) }), true);

  // A new token set by hand wins over the renewed one.
  ctx.config = { ...ctx.config, instagram: { accessToken: 'new-token' } };
  const t = await accessToken(ctx);
  assert.equal(t.token, 'new-token');
  assert.equal(t.expires_at, null);
  await ctx.db.close();
});

test('the pictures are served to Instagram, and admins see the post before it goes out', async () => {
  const { ctx } = await setup();
  ctx.config = { ...ctx.config, adminEmails: ['admin@example.de'] };
  await generateArticle(ctx, '2026-09-24');
  const app = await startApp(ctx);
  try {
    const res = await fetch(`${app.base}/instagram/2026-09-24/1.jpg?v=abc`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
    assert.match(res.headers.get('cache-control'), /public/);
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer()).subarray(0, 2)], [0xff, 0xd8]);
    for (const path of ['/instagram/2026-09-24/0.jpg', '/instagram/2026-09-24/5.jpg', '/instagram/2026-09-24/1.png', '/instagram/2026-09-10/1.jpg']) {
      assert.equal((await fetch(app.base + path)).status, 404, path);
    }

    const b = browser(app.base);
    assert.equal((await b.get('/admin/instagram/2026-09-24')).status, 303, 'admins only');
    await b.post('/registrieren', { display_name: 'Admin', email: 'admin@example.de', password: 'sehr-geheim-1', privacy: '1' });
    const preview = await b.get('/admin/instagram/2026-09-24');
    assert.equal(preview.status, 200);
    assert.equal(preview.text.match(/<img src="\/instagram\/2026-09-24\/\d\.jpg\?v=[0-9a-z]+"/g).length, 4);
    assert.match(preview.text, /Noch nicht gepostet/);
    assert.match(preview.text, /Mietpreisbremse bleibt bis 2029/);
    const admin = await b.get('/admin');
    assert.match(admin.text, /Instagram/);
    assert.match(admin.text, /href="\/admin\/instagram\/2026-09-24"/);

    await ctx.db.query(`update articles set status = 'hidden'`);
    assert.equal((await fetch(`${app.base}/instagram/2026-09-24/1.jpg`)).status, 404, 'a hidden article has no pictures');
  } finally {
    await app.close();
    await ctx.db.close();
  }
});
