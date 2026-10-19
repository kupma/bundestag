import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { generateArticle } from '../src/articles.js';
import { syncDecisions } from '../src/dip.js';
import { browser, fakeClaude, fakeDip, fakeMailer, makeConfig, makeDb, samplePositions, startApp } from './helpers.js';

const linkFrom = (letter, path) => {
  const m = letter.text.match(new RegExp(`https?://[^\\s]+${path}\\?token=([^\\s]+)`));
  assert.ok(m, `no ${path} link in mail`);
  return `${path}?token=${m[1]}`;
};

describe('the website', () => {
  let ctx;
  let app;

  before(async () => {
    const db = await makeDb();
    // DIP also knows an older sitting day, outside every window the tests sync.
    const dip = fakeDip({ positions: [...samplePositions('2026-09-24'), ...samplePositions('2026-09-10')] });
    ctx = { db, config: makeConfig({ adminEmails: ['admin@example.de'] }), claude: fakeClaude(), dip, mailer: fakeMailer(), fetch };
    app = await startApp(ctx);
  });

  after(async () => {
    await app.close();
    await ctx.db.close();
  });

  test('home, static files, health and security headers', async () => {
    const b = browser(app.base);
    const home = await b.get('/');
    assert.equal(home.status, 200);
    assert.match(home.text, /Wahlwort/);
    assert.match(home.text, /Noch kein Sitzungstag/);
    assert.match(home.text, /class="plenum-canvas"/, 'the landing page draws the hall');
    assert.match(home.text, /<script src="\/static\/landing\.js\?v=[0-9a-f]{10}" defer><\/script>/);
    assert.equal((await b.get('/static/landing.js')).status, 200);
    assert.match(home.text, /"@type":"FAQPage"/);
    assert.match(home.text, /Selbst etwas bewegen/);
    assert.match(home.text, /<link rel="stylesheet" href="\/static\/styles\.css\?v=[0-9a-f]{10}">/);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal((await b.get('/static/styles.css')).status, 200);
    const font = await b.get('/static/fonts/figtree.woff2');
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    assert.match(font.headers.get('cache-control'), /max-age=31536000/);
    assert.equal((await b.get('/static/fonts/../../server.js')).status, 404);
    assert.equal((await b.get('/static/../server.js')).status, 404);
    assert.equal((await b.get('/static/%2e%2e%2fserver.js')).status, 404);
    assert.equal((await b.get('/healthz')).text, 'ok');
    const missing = await b.get('/gibt-es-nicht');
    assert.equal(missing.status, 404);
    assert.match(missing.text, /Seite nicht gefunden/);
  });

  test('POST without an Origin from this site is refused', async () => {
    const b = browser(app.base);
    const form = { email: 'x@example.de', display_name: 'X', password: '0123456789', privacy: '1' };
    assert.equal((await b.post('/registrieren', form, { origin: null })).status, 403);
    assert.equal((await b.post('/registrieren', form, { origin: 'https://evil.example' })).status, 403);
    assert.equal(await ctx.db.one(`select id from users where email = 'x@example.de'`), null);
  });

  test('register, confirm, comment, delete', async () => {
    const b = browser(app.base);
    await generateArticleOnce();

    const reg = await b.post('/registrieren', { display_name: 'Ana', email: 'Ana@Example.de', password: 'sehr-geheim-1', newsletter: '1', privacy: '1', weiter: '/artikel/2026-09-24#kommentare' });
    assert.equal(reg.status, 303);
    assert.equal(reg.location, '/artikel/2026-09-24#kommentare');
    assert.ok(b.jar.get('sid'));
    const user = await ctx.db.one(`select * from users where email = 'ana@example.de'`);
    assert.equal(user.newsletter, true);
    assert.equal(user.email_verified_at, null);

    const dup = await b.post('/registrieren', { display_name: 'Ana2', email: 'ana@example.de', password: 'sehr-geheim-1', privacy: '1' });
    assert.equal(dup.status, 400);
    assert.match(dup.text, /gibt es schon ein Konto/);

    // Not confirmed yet: no commenting.
    const early = await b.post('/artikel/2026-09-24/kommentare', { body: 'Hallo' });
    assert.equal(early.status, 400);
    assert.match(early.text, /bestätige zuerst/);

    const letter = ctx.mailer.sent.find((m) => m.to === 'ana@example.de');
    assert.match(letter.subject, /bestätige/);
    const confirm = await b.get(linkFrom(letter, '/konto/bestaetigen'));
    assert.equal(confirm.status, 200);
    assert.match(confirm.text, /bestätigt/);
    assert.equal((await b.get(linkFrom(letter, '/konto/bestaetigen'))).status, 400, 'links work once');

    const posted = await b.post('/artikel/2026-09-24/kommentare', { body: 'Guter Artikel. <script>alert(1)</script>' });
    assert.equal(posted.status, 303);
    assert.match(posted.location, /^\/artikel\/2026-09-24#kommentar-\d+$/);
    const page = await b.get('/artikel/2026-09-24');
    assert.match(page.text, /Guter Artikel\. &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(page.text, /<script>alert/);
    assert.match(page.text, /1 Kommentar</);

    const commentId = Number(posted.location.split('-').pop());
    const other = browser(app.base);
    await other.post('/registrieren', { display_name: 'Bo', email: 'bo@example.de', password: 'sehr-geheim-2', privacy: '1' });
    assert.equal((await other.post(`/kommentare/${commentId}/loeschen`, {})).status, 403);
    assert.equal((await b.post(`/kommentare/${commentId}/loeschen`, {})).status, 303);
    assert.equal(await ctx.db.one('select id from comments where id = $1', [commentId]), null);
  });

  test('the article page explains each decision and how the groups voted', async () => {
    await generateArticleOnce();
    const b = browser(app.base);
    const page = await b.get('/artikel/2026-09-24');
    assert.equal(page.status, 200);
    assert.match(page.text, /<details class="decision" id="beschluss-1">\s*<summary>/, 'each decision is a fold');
    assert.match(page.text, /<script src="\/static\/article\.js\?v=[0-9a-f]{10}" defer><\/script>/);
    assert.match(page.text, /Mietpreisbremse bleibt bis 2029/);
    // the votes, in seat order, in the fold's summary and in the open section
    assert.match(page.text, /<span class="decision-votes"><span><strong>Ja:<\/strong> SPD, CDU\/CSU<\/span><span><strong>Nein:<\/strong> AfD<\/span><\/span>/);
    assert.match(page.text, /<span class="vote-fraktion">SPD<\/span> <span class="vote-pill vote-dafuer">Ja<\/span>/);
    assert.match(page.text, /<span class="vote-fraktion">AfD<\/span> <span class="vote-pill vote-dagegen">Nein<\/span>/);
    assert.match(page.text, /<span class="vote-fraktion">Linke<\/span> <span class="vote-pill vote-unbekannt">unbekannt<\/span>/);
    assert.ok(page.text.indexOf('vote-fraktion">Linke') < page.text.indexOf('vote-fraktion">AfD'), 'left to right as they sit');
    assert.match(page.text, /CDU\/CSU und SPD dafür, AfD dagegen\./);
    assert.match(page.text, /Gemeinsamkeiten/);
    assert.doesNotMatch(page.text, /Wahlprogramm|versprochen|\/stelle\/|venn/);
    assert.match(page.text, /Was du tun kannst/);
    assert.match(page.text, /href="https:\/\/www\.mieterbund\.de" target="_blank" rel="noopener">Mietervereine vor Ort/);
    assert.doesNotMatch(page.text, /erfunden/);
    assert.match(page.text, /Weitere Beschlüsse des Tages/);
    assert.match(page.text, /Plenarprotokoll 21\/45/);
    // what the result means: a passed bill is not in force yet
    assert.match(page.text, /<strong>Was heißt das\?<\/strong> Der Bundestag hat das Gesetz beschlossen\. In Kraft ist es damit noch nicht/);
    assert.match(page.text, /<span>Als Nächstes: Bundesrat<\/span>/);
    assert.match(page.text, /<li class="now" aria-current="step">Bundestag beschließt/);
    assert.match(page.text, /Stand nach der Sitzung vom 24\. September 2026\./);
    assert.match(page.text, /href="\/bundestag-erklaert#gesetz">Wie ein Gesetz entsteht →/);
    assert.match(page.text, /Ein Antrag ist kein Gesetz/);

    const feed = await b.get('/feed.xml');
    assert.match(feed.headers.get('content-type'), /rss/);
    assert.match(feed.text, /<link>http:\/\/localhost:3999\/artikel\/2026-09-24<\/link>/);

    const archive = await b.get('/archiv');
    assert.match(archive.text, /Donnerstag, 24\. September 2026/);
  });

  test('the explainer says how the Bundestag decides, and the site links to it', async () => {
    const b = browser(app.base);
    const res = await b.get('/bundestag-erklaert');
    assert.equal(res.status, 200);
    assert.match(res.text, /<h1>So arbeitet der Bundestag<\/h1>/);
    assert.match(res.text, /<a href="\/bundestag-erklaert" aria-current="page">Grundlagen<\/a>/);
    assert.match(res.text, /<link rel="canonical" href="http:\/\/localhost:3999\/bundestag-erklaert">/);
    for (const id of ['beschlossen', 'gesetz', 'vorlagen', 'abstimmung', 'wer', 'lexikon']) {
      assert.match(res.text, new RegExp(`<section id="${id}"`));
      assert.match(res.text, new RegExp(`href="#${id}"`));
    }
    assert.match(res.text, /Vorabstimmung/);
    assert.match(res.text, /id="lexikon-beschlussempfehlung"/);
    assert.match(res.text, /Die Koalition bilden SPD und CDU\/CSU mit zusammen 328 von 630 Sitzen/);
    assert.match(res.text, /mindestens 316 von 630 Stimmen/);
    assert.match(res.text, /also 420 Stimmen/);

    assert.match((await b.get('/')).text, /href="\/bundestag-erklaert"/);
    assert.match((await b.get('/vorschau')).text, /href="\/bundestag-erklaert"/);
    assert.match((await b.get('/sitemap.xml')).text, /<loc>http:\/\/localhost:3999\/bundestag-erklaert<\/loc>/);
  });

  test('the Mitmachen page lists every theme with working anchors', async () => {
    const res = await browser(app.base).get('/mitmachen');
    assert.equal(res.status, 200);
    for (const id of ['gelassen', 'einkaufen', 'demokratie', 'miteinander']) {
      assert.match(res.text, new RegExp(`<section class="theme" id="${id}">`));
      assert.match(res.text, new RegExp(`href="#${id}"`));
    }
    assert.match(res.text, /Weniger wegwerfen/);
    assert.match(res.text, /href="https:\/\/epetitionen\.bundestag\.de" target="_blank" rel="noopener">Petition an den Bundestag/);
    assert.match(res.text, /aria-current="page">Mitmachen</);
  });

  test('an article and each of its decisions can be shared, also without JavaScript', async () => {
    await generateArticleOnce();
    const b = browser(app.base);
    const page = await b.get('/artikel/2026-09-24');
    assert.match(page.text, /<script src="\/static\/share\.js\?v=[0-9a-f]{10}" defer><\/script>/);
    const article = await ctx.db.one(`select body from articles where slug = '2026-09-24'`);
    const decisions = article.body.decisions;
    const sheets = page.text.match(/<details class="share"/g) || [];
    assert.equal(sheets.length, decisions.length + 1, 'one for the article, one per decision');

    // the article: its own address, its title and the day
    const articleUrl = 'http://localhost:3999/artikel/2026-09-24';
    assert.match(page.text, new RegExp(`<details class="share" data-share-url="${articleUrl}" data-share-text="Mietpreisbremse bleibt bis 2029 – Bundestag am 24\\. September 2026">`));
    // a decision: an address of its own, by the decision's number, not its place
    const d = decisions[0];
    const decisionUrl = `${articleUrl}/beschluss/${d.decisionId}`;
    assert.match(page.text, new RegExp(`data-share-url="${decisionUrl}" data-share-text="${d.headline} – Bundestag am 24\\. September 2026"`));
    assert.ok(page.text.includes(`href="https://wa.me/?text=${encodeURIComponent(`${d.headline} – Bundestag am 24. September 2026\n${decisionUrl}`)}" target="_blank" rel="noopener"`));
    assert.ok(page.text.includes(`href="https://t.me/share/url?url=${encodeURIComponent(decisionUrl)}&amp;text=`));
    assert.ok(page.text.includes(`href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(decisionUrl)}" target="_blank" rel="noopener"`));
    assert.match(page.text, /href="mailto:\?subject=[^"]+&amp;body=[^"]+">/, 'mail opens in place, not in a tab');
    assert.ok(page.text.includes(`<input class="share-url" type="text" value="${decisionUrl}" readonly`), 'the address to copy by hand');
    // what needs a script waits for it
    assert.match(page.text, /<li hidden><button type="button" class="share-target" data-share="copy">/);
    assert.match(page.text, /<li hidden><button type="button" class="share-target" data-share="native">/);
    assert.match(page.text, /<span class="visually-hidden">: Mietpreisbremse verlängert<\/span>/, 'screen readers hear which decision');
    assert.equal((await b.get('/static/share.js')).status, 200);
    const icons = await b.get('/static/share-icons.svg');
    assert.equal(icons.headers.get('content-type'), 'image/svg+xml');
    for (const id of ['teilen', 'link', 'mail', 'mehr', 'whatsapp', 'telegram', 'bluesky', 'x', 'facebook']) assert.match(icons.text, new RegExp(`<symbol id="${id}"`));
    assert.doesNotMatch(page.text, /<script[^>]+src="https?:/, 'no outside script');
  });

  test('a shared decision opens in its article, with a preview of its own', async () => {
    await generateArticleOnce();
    const b = browser(app.base);
    const { body } = await ctx.db.one(`select body from articles where slug = '2026-09-24'`);
    const d = body.decisions[body.decisions.length - 1];
    const res = await b.get(`/artikel/2026-09-24/beschluss/${d.decisionId}`);
    assert.equal(res.status, 200);
    const i = body.decisions.indexOf(d) + 1;
    assert.match(res.text, new RegExp(`<details class="decision" id="beschluss-${i}" open data-shared>`));
    assert.equal((res.text.match(/<details class="decision"[^>]* open/g) || []).length, 1, 'only that one is open');
    assert.match(res.text, /<link rel="canonical" href="http:\/\/localhost:3999\/artikel\/2026-09-24">/, 'one page for search engines');
    assert.match(res.text, new RegExp(`<meta property="og:url" content="http://localhost:3999/artikel/2026-09-24/beschluss/${d.decisionId}">`));
    assert.match(res.text, new RegExp(`<meta property="og:title" content="${d.headline} – Bundestag am 24\\. September 2026">`));
    assert.match(res.text, /<meta property="og:description" content="(Angenommen|Abgelehnt|Für erledigt erklärt|Beschlossen) im Bundestag am 24\. September 2026\. /);

    // the article itself is unchanged: nothing open, its own card
    const plain = await b.get('/artikel/2026-09-24');
    assert.doesNotMatch(plain.text, /<details class="decision"[^>]* open/);
    assert.match(plain.text, /<meta property="og:url" content="http:\/\/localhost:3999\/artikel\/2026-09-24">/);

    // a decision a rewrite has dropped leads to the article; an unknown article is not found
    const gone = await b.get('/artikel/2026-09-24/beschluss/999999');
    assert.equal(gone.status, 302);
    assert.equal(gone.location, '/artikel/2026-09-24');
    assert.equal((await b.get('/artikel/2026-09-24/beschluss/abc')).status, 302);
    assert.equal((await b.get(`/artikel/1999-01-01/beschluss/${d.decisionId}`)).status, 404);
  });

  test('the old library addresses lead home, and nothing links to them', async () => {
    const b = browser(app.base);
    for (const path of ['/programme', '/programme/spd-wahlprogramm-2025?q=Mieter', '/stelle/42']) {
      const res = await b.get(path);
      assert.equal(res.status, 301, path);
      assert.equal(res.location, '/');
    }
    const home = await b.get('/');
    assert.doesNotMatch(home.text, /href="\/programme|Bibliothek|versprochen/);
  });

  test('the about page says how the texts come about, and what they cannot do', async () => {
    const res = await browser(app.base).get('/ueber');
    assert.equal(res.status, 200);
    assert.match(res.text, /<h2 id="methode">Methode<\/h2>/);
    assert.match(res.text, /Aus dem Ausschuss/);
    assert.match(res.text, /<h2>Grenzen<\/h2>/);
    assert.doesNotMatch(res.text, /Wahlprogramm|Bibliothek/);
  });

  test('login, logout, password reset', async () => {
    const b = browser(app.base);
    await b.post('/registrieren', { display_name: 'Cem', email: 'cem@example.de', password: 'erstes-passwort', privacy: '1' });
    assert.equal((await b.post('/abmelden', {})).status, 303);
    assert.equal(b.jar.has('sid'), false);

    const wrong = await b.post('/anmelden', { email: 'cem@example.de', password: 'falsch-falsch' });
    assert.equal(wrong.status, 401);
    assert.match(wrong.text, /stimmen nicht/);
    const ok = await b.post('/anmelden', { email: 'CEM@example.de', password: 'erstes-passwort', weiter: '//evil.example' });
    assert.equal(ok.status, 303);
    assert.equal(ok.location, '/', 'no open redirect');

    const anon = browser(app.base);
    const asked = await anon.post('/passwort-vergessen', { email: 'cem@example.de' });
    assert.match(asked.text, /Wenn es zu dieser Adresse ein Konto gibt/);
    const unknown = await anon.post('/passwort-vergessen', { email: 'niemand@example.de' });
    assert.match(unknown.text, /Wenn es zu dieser Adresse ein Konto gibt/, 'same answer either way');
    const letter = ctx.mailer.sent.filter((m) => m.to === 'cem@example.de').pop();
    const token = linkFrom(letter, '/passwort-neu').split('token=')[1];
    const reset = await anon.post('/passwort-neu', { token: decodeURIComponent(token), password: 'zweites-passwort' });
    assert.equal(reset.status, 303);
    assert.equal(reset.location, '/konto?ok=passwort');
    assert.ok(anon.jar.get('sid'), 'logged in after reset');
    assert.equal((await b.get('/konto')).status, 303, 'old sessions end');
    assert.equal((await browser(app.base).post('/anmelden', { email: 'cem@example.de', password: 'erstes-passwort' })).status, 401);
    assert.equal((await browser(app.base).post('/anmelden', { email: 'cem@example.de', password: 'zweites-passwort' })).status, 303);
  });

  test('one-click unsubscribe works without a browser', async () => {
    const b = browser(app.base);
    await b.post('/registrieren', { display_name: 'Dia', email: 'dia@example.de', password: 'sehr-geheim-3', newsletter: '1', privacy: '1' });
    const { unsubscribe_token: t } = await ctx.db.one(`select unsubscribe_token from users where email = 'dia@example.de'`);
    const page = await browser(app.base).get(`/newsletter/abmelden?t=${encodeURIComponent(t)}`);
    assert.match(page.text, /wirklich abbestellen/);
    // Mail providers post RFC 8058 one-click requests from their own servers.
    const res = await fetch(`${app.base}/newsletter/abmelden?t=${encodeURIComponent(t)}`, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(res.status, 200);
    assert.equal((await ctx.db.one(`select newsletter from users where email = 'dia@example.de'`)).newsletter, false);
    assert.equal((await fetch(`${app.base}/newsletter/abmelden?t=falsch`, { method: 'POST' })).status, 400);
  });

  test('account deletion needs the password and takes the comments along', async () => {
    await generateArticleOnce();
    const b = browser(app.base);
    await b.post('/registrieren', { display_name: 'Eve', email: 'eve@example.de', password: 'sehr-geheim-4', privacy: '1' });
    const user = await ctx.db.one(`select id from users where email = 'eve@example.de'`);
    await ctx.db.query('update users set email_verified_at = now() where id = $1', [user.id]);
    await b.post('/artikel/2026-09-24/kommentare', { body: 'Tschüss' });
    assert.equal((await b.post('/konto/loeschen', { password: 'falsch' })).status, 400);
    const gone = await b.post('/konto/loeschen', { password: 'sehr-geheim-4' });
    assert.equal(gone.status, 200);
    assert.match(gone.text, /Konto gelöscht/);
    assert.equal(await ctx.db.one('select id from users where id = $1', [user.id]), null);
    assert.equal((await ctx.db.one('select count(*)::int as n from comments where user_id = $1', [user.id])).n, 0);
  });

  test('admin area: access, hiding articles', async () => {
    await generateArticleOnce();
    const visitor = browser(app.base);
    assert.equal((await visitor.get('/admin')).status, 303, 'not logged in → login');
    await visitor.post('/registrieren', { display_name: 'Fay', email: 'fay@example.de', password: 'sehr-geheim-5', privacy: '1' });
    assert.equal((await visitor.get('/admin')).status, 403);

    const admin = browser(app.base);
    await admin.post('/registrieren', { display_name: 'Admin', email: 'admin@example.de', password: 'sehr-geheim-6', privacy: '1' });
    const page = await admin.get('/admin');
    assert.equal(page.status, 200);
    assert.match(page.text, /Sitzungstage/);
    assert.match(page.text, /PGlite/);
    assert.doesNotMatch(page.text, /Bibliothek|Voyage/);

    assert.equal((await admin.post('/admin/artikel', { date: 'gestern' })).status, 400);

    const article = await ctx.db.one(`select id from articles where slug = '2026-09-24'`);
    assert.equal((await admin.post(`/admin/artikel/${article.id}/ausblenden`, {})).status, 303);
    assert.equal((await visitor.get('/artikel/2026-09-24')).status, 404);
    assert.equal((await admin.get('/artikel/2026-09-24')).status, 200, 'admins still see it');
    await admin.post(`/admin/artikel/${article.id}/einblenden`, {});
    assert.equal((await visitor.get('/artikel/2026-09-24')).status, 200);
  });

  test('the home page says what is on its way', async () => {
    await syncDecisions({ db: ctx.db, dip: fakeDip({ positions: samplePositions('2026-09-23') }) }, { start: '2026-09-23', end: '2026-09-23' });
    await ctx.db.query(`insert into job_runs (kind, finished_at, ok) values ('dip-sync', now(), true)`);
    const home = await browser(app.base).get('/');
    assert.match(home.text, /In Vorbereitung:<\/strong> Sitzung vom Mittwoch, 23\. September 2026/);
  });

  test('admins can write any sitting day; the app fetches that day first', async () => {
    const admin = browser(app.base);
    assert.equal((await admin.post('/anmelden', { email: 'admin@example.de', password: 'sehr-geheim-6' })).status, 303);
    assert.equal(await ctx.db.one(`select id from decisions where sitting_date = '2026-09-10'`), null);
    assert.equal((await admin.post('/admin/artikel', { date: '2026-09-10' })).status, 303);
    await app.handler.idle();
    assert.ok(ctx.dip.calls.some((c) => c[0] === 'positions' && c[1] === '2026-09-10' && c[2] === '2026-09-10'));
    const article = await ctx.db.one(`select slug from articles where sitting_date = '2026-09-10'`);
    assert.equal(article.slug, '2026-09-10');
    assert.equal((await admin.get('/artikel/2026-09-10')).status, 200);
  });

  let generated = false;
  async function generateArticleOnce() {
    if (generated) return;
    generated = true;
    await syncDecisions(ctx, { start: '2026-09-20', end: '2026-09-25' });
    await generateArticle(ctx, '2026-09-24');
  }

  test('search engines: sitemaps, robots, manifest, structured data', async () => {
    const b = browser(app.base);
    const robots = await b.get('/robots.txt');
    assert.match(robots.text, /Sitemap: http:\/\/localhost:3999\/sitemap\.xml/);
    assert.match(robots.text, /Disallow: \/admin/);
    const sitemap = await b.get('/sitemap.xml');
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.headers.get('content-type'), /xml/);
    assert.match(sitemap.text, /<loc>http:\/\/localhost:3999\/artikel\/2026-09-24<\/loc><lastmod>/);
    assert.doesNotMatch(sitemap.text, /\/programme/);
    assert.match((await b.get('/news-sitemap.xml')).text, /<urlset[^>]+sitemap-news/);
    assert.equal(JSON.parse((await b.get('/manifest.webmanifest')).text).lang, 'de');
    assert.equal((await b.get('/static/og.png')).headers.get('content-type'), 'image/png');
    assert.match((await b.get('/')).text, /<meta property="og:image" content="http:\/\/localhost:3999\/static\/og\.png\?v=[0-9a-f]{10}">/);

    const article = await b.get('/artikel/2026-09-24?utm_source=newsletter');
    assert.match(article.text, /<link rel="canonical" href="http:\/\/localhost:3999\/artikel\/2026-09-24">/, 'no utm in the canonical address');
    assert.match(article.text, /<title>[^<]+ – Bundestag am 24\. September 2026 – Wahlwort<\/title>/);
    assert.match(article.text, /<meta property="og:type" content="article">/);
    const ld = JSON.parse(article.text.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    const news = ld['@graph'].find((x) => x['@type'] === 'NewsArticle');
    assert.ok(news.datePublished && news.headline);
    assert.ok(ld['@graph'].some((x) => x['@type'] === 'BreadcrumbList'));
    assert.match((await b.get('/anmelden')).text, /<meta name="robots" content="noindex">/);
  });

  test('the statistics count people, not bots or admins, without a cookie', async () => {
    await ctx.db.query('delete from page_views');
    const reader = browser(app.base);
    const res = await reader.get('/mitmachen', { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone) Mobile', Referer: 'https://www.google.de/' } });
    assert.equal(res.headers.get('set-cookie'), null);
    await reader.get('/archiv?utm_source=newsletter', { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone) Mobile' } });
    await reader.get('/mitmachen', { headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } });
    await reader.get('/gibt-es-nicht', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    await app.handler.idle();
    const { rows } = await ctx.db.query('select path, referrer, source, device, visitor from page_views order by id');
    assert.deepEqual(rows.map((r) => [r.path, r.referrer, r.source, r.device]), [
      ['/mitmachen', 'google.de', '', 'Mobil'],
      ['/archiv', '', 'newsletter', 'Mobil'],
    ]);
    assert.equal(rows[0].visitor, rows[1].visitor, 'the same person on the same day');
    assert.doesNotMatch(JSON.stringify(rows), /127\.0\.0\.1/, 'no IP address stored');

    const admin = browser(app.base);
    await admin.post('/anmelden', { email: 'admin@example.de', password: 'sehr-geheim-6' });
    const page = await admin.get('/admin/statistik');
    assert.equal(page.status, 200);
    assert.match(page.text, /Google/);
    assert.match(page.text, /newsletter/);
    await app.handler.idle();
    assert.equal((await ctx.db.one('select count(*)::int as n from page_views')).n, 2, 'admins are not counted');
    assert.equal((await reader.get('/admin/statistik')).status, 303);
  });
});
