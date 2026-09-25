import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { generateArticle } from '../src/articles.js';
import { syncDecisions } from '../src/dip.js';
import { createProgram, ingestProgramPdf } from '../src/programs.js';
import { browser, fakeClaude, fakeDip, fakeMailer, makeConfig, makeDb, makePdf, startApp } from './helpers.js';

const linkFrom = (letter, path) => {
  const m = letter.text.match(new RegExp(`https?://[^\\s]+${path}\\?token=([^\\s]+)`));
  assert.ok(m, `no ${path} link in mail`);
  return `${path}?token=${m[1]}`;
};

describe('the website', () => {
  let ctx;
  let app;
  let programId;

  before(async () => {
    const db = await makeDb();
    ctx = { db, config: makeConfig({ adminEmails: ['admin@example.de'] }), claude: fakeClaude(), dip: fakeDip(), embedder: null, mailer: fakeMailer(), fetch };
    for (const [party, text] of [
      ['SPD', 'Wir werden die Mietpreisbremse verlängern und Mieterinnen und Mieter schützen.'],
      ['CDU/CSU', 'Mieten: Wir setzen auf Neubau. Die Mietpreisbremse lassen wir auslaufen.'],
    ]) {
      const p = await createProgram(db, { party, title: 'Wahlprogramm 2025', kind: 'wahlprogramm', election: 'Bundestagswahl 2025', sourceUrl: 'https://example.org/p.pdf' });
      await ingestProgramPdf({ db }, p.id, await makePdf([['Titelseite'], [text]]));
      programId ??= p.id;
    }
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
    assert.match(home.text, /Versprochen &amp; Beschlossen/);
    assert.match(home.text, /Noch kein Sitzungstag/);
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

  test('the article page shows verdicts, quotes and links to the passages', async () => {
    await generateArticleOnce();
    const b = browser(app.base);
    const page = await b.get('/artikel/2026-09-24');
    assert.equal(page.status, 200);
    assert.match(page.text, /Mietpreisbremse bleibt – wie versprochen\?/);
    assert.match(page.text, /Entspricht dem Programm/);
    assert.match(page.text, /Fraktion stimmte mit Ja/);
    assert.match(page.text, /href="\/stelle\/\d+">Wahlprogramm SPD, PDF-Seite 2<\/a>/);
    assert.match(page.text, /Auf einen Blick/);
    assert.match(page.text, /aria-label="SPD: (Entspricht|Widerspricht|Teilweise|Im Programm)/);
    assert.match(page.text, /Gemeinsamkeiten/);
    assert.match(page.text, /Was du tun kannst/);
    assert.match(page.text, /href="https:\/\/www\.mieterbund\.de" target="_blank" rel="noopener">Mietervereine vor Ort/);
    assert.doesNotMatch(page.text, /erfunden/);
    assert.match(page.text, /href="https:\/\/example\.org\/p\.pdf#page=2"/);
    assert.match(page.text, /Weitere Beschlüsse des Tages/);
    assert.match(page.text, /Plenarprotokoll 21\/45/);

    const passageId = Number(page.text.match(/href="\/stelle\/(\d+)">Wahlprogramm SPD/)[1]);
    const passage = await b.get(`/stelle/${passageId}`);
    assert.equal(passage.status, 200);
    assert.match(passage.text, /Mietpreisbremse verlängern/);
    assert.match(passage.text, /Zitiert in/);

    const feed = await b.get('/feed.xml');
    assert.match(feed.headers.get('content-type'), /rss/);
    assert.match(feed.text, /<link>http:\/\/localhost:3999\/artikel\/2026-09-24<\/link>/);

    const archive = await b.get('/archiv');
    assert.match(archive.text, /Donnerstag, 24\. September 2026/);
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

  test('library search marks hits and escapes everything else', async () => {
    const b = browser(app.base);
    const res = await b.get(`/programme?q=${encodeURIComponent('Mietpreisbremse')}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /<mark>Mietpreisbremse<\/mark>/);
    const nasty = await b.get(`/programme?q=${encodeURIComponent('"><script>x</script>')}`);
    assert.match(nasty.text, /value="&quot;&gt;&lt;script&gt;x&lt;\/script&gt;"/);
    assert.doesNotMatch(nasty.text, /<script>x/);
    const program = await ctx.db.one('select slug from programs where id = $1', [programId]);
    const one = await b.get(`/programme/${program.slug}?q=Mieter`);
    assert.equal(one.status, 200);
    assert.match(one.text, /<mark>Mieter/);
    assert.equal((await b.get('/programme/gibt-es-nicht')).status, 404);
    assert.equal((await b.get('/stelle/999999')).status, 404);
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

  test('admin area: access, programme upload, hiding articles', async () => {
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

    assert.equal((await admin.post('/admin/artikel', { date: 'gestern' })).status, 400);

    const pdf = await makePdf([['Grünes Programm'], ['Klimageld für alle Bürgerinnen und Bürger.']]);
    const upload = await fetch(`${app.base}/admin/programme/upload?party=Gr%C3%BCne&title=Wahlprogramm&kind=wahlprogramm&source_url=https%3A%2F%2Fexample.org%2Fg.pdf`, {
      method: 'POST',
      headers: { Origin: app.base, Cookie: `sid=${admin.jar.get('sid')}`, 'Content-Type': 'application/pdf' },
      body: pdf,
    });
    assert.equal(upload.status, 202);
    const { slug } = await upload.json();
    await app.handler.idle();
    const program = await ctx.db.one('select status, page_count from programs where slug = $1', [slug]);
    assert.deepEqual(program, { status: 'ready', page_count: 2 });
    const notPdf = await fetch(`${app.base}/admin/programme/upload?party=X&title=Y`, { method: 'POST', headers: { Origin: app.base, Cookie: `sid=${admin.jar.get('sid')}` }, body: 'hallo' });
    assert.equal(notPdf.status, 400);
    const asVisitor = await fetch(`${app.base}/admin/programme/upload?party=X&title=Y`, { method: 'POST', headers: { Origin: app.base, Cookie: `sid=${visitor.jar.get('sid')}` }, body: pdf });
    assert.equal(asVisitor.status, 403);

    const article = await ctx.db.one(`select id from articles where slug = '2026-09-24'`);
    assert.equal((await admin.post(`/admin/artikel/${article.id}/ausblenden`, {})).status, 303);
    assert.equal((await visitor.get('/artikel/2026-09-24')).status, 404);
    assert.equal((await admin.get('/artikel/2026-09-24')).status, 200, 'admins still see it');
    await admin.post(`/admin/artikel/${article.id}/einblenden`, {});
    assert.equal((await visitor.get('/artikel/2026-09-24')).status, 200);
  });

  let generated = false;
  async function generateArticleOnce() {
    if (generated) return;
    generated = true;
    await syncDecisions(ctx, { start: '2026-09-20', end: '2026-09-25' });
    await generateArticle(ctx, '2026-09-24');
  }
});
