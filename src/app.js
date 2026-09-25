// HTTP: routing, forms, sessions and the pages. Plain node:http with a small
// router – every page is rendered on the server, and nothing a reader does
// needs JavaScript (the admin upload is the one exception).
//
// Cross-site request forgery: session cookies are SameSite=Lax, and every POST
// must carry an Origin (or Referer) header naming this site. The one exception
// is the one-click unsubscribe, which mail providers post from their servers
// and which is authorised by the token in its address instead.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateArticle } from './articles.js';
import {
  clearSessionCookie,
  consumeUserToken,
  createSession,
  destroySession,
  hashPassword,
  issueUserToken,
  normalizeEmail,
  parseCookies,
  randomToken,
  SESSION_COOKIE,
  sessionCookie,
  sessionUser,
  validateRegistration,
  verifyPassword,
} from './auth.js';
import { runJob, recentJobs } from './jobs.js';
import { mailArticle } from './newsletter.js';
import { createProgram, downloadPdf, ingestProgramPdf, validateProgramMeta } from './programs.js';
import { createLimiter } from './ratelimit.js';
import { searchLibrary } from './retrieval.js';
import { tick } from './scheduler.js';
import { addDays, berlinDate, isYmd } from './text.js';
import {
  accountPage,
  forgotPage,
  loginPage,
  messagePage,
  registerPage,
  resetMail,
  resetPage,
  unsubscribePage,
  verifyMail,
} from './views/account.js';
import { adminPage } from './views/admin.js';
import { libraryPage, passagePage, programPage } from './views/library.js';
import { aboutPage, archivePage, articlePage, errorPage, homePage, imprintPage, mitmachenPage, privacyPage, rssFeed } from './views/public.js';

const STATIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'static');
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const FORM_LIMIT = 100 * 1024;
const PDF_LIMIT = 80 * 1024 * 1024;

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

const NOTICES = {
  willkommen: 'Willkommen! Dein Konto ist angelegt.',
  willkommen_mail: 'Willkommen! Wir haben dir eine E-Mail geschickt – bitte bestätige darin deine Adresse.',
  gespeichert: 'Gespeichert.',
  gesendet: 'Der Bestätigungslink ist unterwegs.',
  passwort: 'Dein neues Passwort ist gespeichert.',
  tick: 'Die Aktualisierung läuft im Hintergrund. Das Ergebnis erscheint gleich im Protokoll.',
  artikel: 'Der Artikel wird im Hintergrund erzeugt. Das dauert einige Minuten – Ergebnis im Protokoll.',
  import: 'Der Import läuft im Hintergrund. Seite in einer Minute neu laden.',
  geloescht: 'Gelöscht.',
  versand: 'Der Versand läuft im Hintergrund.',
  status: 'Geändert.',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function compile(pattern) {
  const keys = [];
  const re = new RegExp(
    `^${pattern.replace(/\/:([a-z_]+)/g, (_, k) => {
      keys.push(k);
      return '/([^/]+)';
    })}/?$`,
  );
  return { re, keys };
}

export function safeNext(value) {
  const v = String(value || '');
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '';
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

function sameOrigin(req, config) {
  let origin = req.headers.origin;
  if (!origin && req.headers.referer) {
    try {
      origin = new URL(req.headers.referer).origin;
    } catch {
      origin = null;
    }
  }
  if (!origin || origin === 'null') return false;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
  return origin === new URL(config.baseUrl).origin || origin === `${proto}://${host}`;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return reject(new HttpError(413, 'Die Anfrage ist zu groß.'));
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Die Anfrage ist zu groß.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const LIMITS = {
  login: { windowMs: 15 * 60e3, max: 10 },
  register: { windowMs: 60 * 60e3, max: 5 },
  comment: { windowMs: 10 * 60e3, max: 6 },
  mail: { windowMs: 60 * 60e3, max: 3 },
  search: { windowMs: 60e3, max: 30 },
};

export function createApp(ctx, { limits: limitOverrides = {} } = {}) {
  const { db, config, mailer } = ctx;
  const limits = Object.fromEntries(Object.entries({ ...LIMITS, ...limitOverrides }).map(([k, v]) => [k, createLimiter(v)]));
  const pending = new Set();
  const routes = [];

  const route = (method, pattern, handler, opts = {}) => routes.push({ method, ...compile(pattern), handler, opts });

  // Admin actions that take minutes run after the response has gone out.
  function background(label, fn) {
    const p = (async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[${label}]`, err.message);
      }
    })();
    pending.add(p);
    p.finally(() => pending.delete(p));
  }

  // --- helpers used by handlers ---------------------------------------------------

  const requireUser = (c) => {
    if (!c.user) {
      c.redirect(`/anmelden?weiter=${encodeURIComponent(c.url.pathname + c.url.search)}`);
      return false;
    }
    return true;
  };
  const requireAdmin = (c) => {
    if (!c.user) return requireUser(c);
    if (!c.user.is_admin) throw new HttpError(403, 'Dieser Bereich ist nur für Admins.');
    return true;
  };
  const notice = (c) => NOTICES[c.query.get('ok')] || '';

  async function sendVerification(user) {
    const token = await issueUserToken(db, user.id, 'verify', 48);
    return mailer.sendMail({ to: user.email, ...verifyMail(config, user, token) });
  }

  async function loadArticle(slug, user) {
    const article = await db.one('select * from articles where slug = $1', [slug]);
    if (!article || (article.status !== 'published' && !(user && user.is_admin))) return null;
    return article;
  }

  async function loadComments(articleId) {
    const { rows } = await db.query(
      `select c.id, c.body, c.created_at, c.user_id, u.display_name
         from comments c join users u on u.id = c.user_id
        where c.article_id = $1 order by c.created_at, c.id`,
      [articleId],
    );
    return rows;
  }

  // --- public pages -----------------------------------------------------------------

  const ARTICLE_LIST = `select a.id, a.slug, a.sitting_date, a.title, a.lede, a.published_at,
      coalesce(jsonb_array_length(a.body->'decisions'), 0)::int as decision_count,
      (select count(*)::int from comments c where c.article_id = a.id) as comment_count
    from articles a where a.status = 'published' order by a.sitting_date desc`;

  route('GET', '/', async (c) => {
    const { rows } = await db.query(`${ARTICLE_LIST} limit 11`);
    const latest = rows.length
      ? { ...rows[0], body: (await db.one('select body from articles where id = $1', [rows[0].id])).body }
      : null;
    const programs = await db.one(`select count(*)::int as n from programs where status = 'ready'`);
    c.html(homePage(c.view, { latest, articles: rows, programCount: programs.n }));
  });

  route('GET', '/mitmachen', async (c) => c.html(mitmachenPage(c.view)));

  route('GET', '/archiv', async (c) => {
    const { rows } = await db.query(`${ARTICLE_LIST} limit 1000`);
    c.html(archivePage(c.view, { articles: rows }));
  });

  route('GET', '/artikel/:slug', async (c) => {
    const article = await loadArticle(c.params.slug, c.user);
    if (!article) throw new HttpError(404, 'Diesen Artikel gibt es nicht.');
    c.html(articlePage(c.view, { article, comments: await loadComments(article.id) }));
  });

  route('POST', '/artikel/:slug/kommentare', async (c) => {
    if (!requireUser(c)) return;
    const article = await loadArticle(c.params.slug, c.user);
    if (!article) throw new HttpError(404, 'Diesen Artikel gibt es nicht.');
    const text = String(c.form.body || '').replace(/\r\n?/g, '\n').trim();
    let error = '';
    if (c.view.requireVerified && !c.user.email_verified_at) error = 'Bitte bestätige zuerst deine E-Mail-Adresse.';
    else if (text.length < 2) error = 'Der Kommentar ist leer.';
    else if (text.length > 4000) error = 'Der Kommentar ist zu lang (höchstens 4000 Zeichen).';
    else if (!limits.comment.hit(`u${c.user.id}`)) error = 'Du hast gerade sehr viel kommentiert. Bitte warte ein paar Minuten.';
    if (error) {
      return c.html(articlePage(c.view, { article, comments: await loadComments(article.id), commentError: error, commentDraft: text }), 400);
    }
    const row = await db.one('insert into comments (article_id, user_id, body) values ($1, $2, $3) returning id', [article.id, c.user.id, text]);
    c.redirect(`/artikel/${article.slug}#kommentar-${row.id}`);
  });

  route('POST', '/kommentare/:id/loeschen', async (c) => {
    if (!requireUser(c)) return;
    const comment = await db.one(
      'select c.id, c.user_id, a.slug from comments c join articles a on a.id = c.article_id where c.id = $1',
      [Number(c.params.id) || 0],
    );
    if (!comment) throw new HttpError(404, 'Diesen Kommentar gibt es nicht mehr.');
    if (comment.user_id !== c.user.id && !c.user.is_admin) throw new HttpError(403, 'Das ist nicht dein Kommentar.');
    await db.query('delete from comments where id = $1', [comment.id]);
    let fromAdmin = false;
    try {
      fromAdmin = new URL(c.req.headers.referer || '', config.baseUrl).pathname === '/admin';
    } catch {
      // no usable Referer: back to the article
    }
    c.redirect(fromAdmin ? '/admin?ok=geloescht' : `/artikel/${comment.slug}#kommentare`);
  });

  route('GET', '/programme', async (c) => {
    const q = String(c.query.get('q') || '').slice(0, 200);
    if (q && !limits.search.hit(c.ip)) throw new HttpError(429, 'Zu viele Suchanfragen. Bitte kurz warten.');
    const { rows: programs } = await db.query(
      `select slug, party, title, kind, election, page_count from programs where status = 'ready' order by kind desc, party`,
    );
    const hits = q ? await searchLibrary(db, q, { limit: 30 }) : [];
    c.html(libraryPage(c.view, { programs, q, hits }));
  });

  route('GET', '/programme/:slug', async (c) => {
    const program = await db.one(
      `select p.*, (select count(*)::int from program_chunks k where k.program_id = p.id) as chunk_count
         from programs p where p.slug = $1 and p.status = 'ready'`,
      [c.params.slug],
    );
    if (!program) throw new HttpError(404, 'Dieses Dokument gibt es nicht.');
    const q = String(c.query.get('q') || '').slice(0, 200);
    if (q && !limits.search.hit(c.ip)) throw new HttpError(429, 'Zu viele Suchanfragen. Bitte kurz warten.');
    const hits = q ? await searchLibrary(db, q, { programId: program.id, limit: 40 }) : [];
    const { rows: cited } = await db.query(
      `select ac.chunk_id, k.page, a.slug, a.title, a.sitting_date
         from article_citations ac
         join program_chunks k on k.id = ac.chunk_id
         join articles a on a.id = ac.article_id and a.status = 'published'
        where k.program_id = $1 order by a.sitting_date desc, k.page limit 20`,
      [program.id],
    );
    c.html(programPage(c.view, { program, q, hits, cited }));
  });

  route('GET', '/stelle/:id', async (c) => {
    const passage = await db.one(
      `select k.id, k.page, k.ord, k.text, k.program_id, p.slug, p.party, p.title, p.kind, p.source_url
         from program_chunks k join programs p on p.id = k.program_id
        where k.id = $1 and p.status = 'ready'`,
      [Number(c.params.id) || 0],
    );
    if (!passage) throw new HttpError(404, 'Diese Passage gibt es nicht (mehr).');
    const prev = await db.one(
      `select id from program_chunks where program_id = $1 and (page, ord) < ($2, $3) order by page desc, ord desc limit 1`,
      [passage.program_id, passage.page, passage.ord],
    );
    const next = await db.one(
      `select id from program_chunks where program_id = $1 and (page, ord) > ($2, $3) order by page, ord limit 1`,
      [passage.program_id, passage.page, passage.ord],
    );
    const { rows: citedIn } = await db.query(
      `select a.slug, a.title, a.sitting_date from article_citations ac join articles a on a.id = ac.article_id
        where ac.chunk_id = $1 and a.status = 'published' order by a.sitting_date desc`,
      [passage.id],
    );
    c.html(passagePage(c.view, { passage, prev, next, citedIn }));
  });

  route('GET', '/ueber', async (c) => {
    const { rows: programs } = await db.query(`select slug, party, title from programs where status = 'ready' order by kind desc, party`);
    c.html(aboutPage(c.view, { programs }));
  });
  route('GET', '/impressum', async (c) => c.html(imprintPage(c.view)));
  route('GET', '/datenschutz', async (c) => c.html(privacyPage(c.view)));

  route('GET', '/feed.xml', async (c) => {
    const { rows } = await db.query(`${ARTICLE_LIST} limit 30`);
    c.send(200, rssFeed(config, rows), 'application/rss+xml; charset=utf-8');
  });

  route('GET', '/healthz', async (c) => {
    await db.one('select 1 as ok');
    c.send(200, 'ok', 'text/plain; charset=utf-8');
  });

  route('GET', '/robots.txt', async (c) => {
    c.send(200, 'User-agent: *\nDisallow: /admin\nDisallow: /konto\n', 'text/plain; charset=utf-8');
  });

  // For an external cron, if the in-process clock is switched off.
  route('GET', '/api/tick', async (c) => {
    if (!config.cronSecret || c.query.get('secret') !== config.cronSecret) throw new HttpError(404);
    const report = await tick(ctx, { forceSync: true });
    c.send(200, JSON.stringify(report), 'application/json');
  });

  // --- accounts ------------------------------------------------------------------------

  route('GET', '/registrieren', async (c) => {
    if (c.user) return c.redirect('/konto');
    c.html(registerPage(c.view, { next: safeNext(c.query.get('weiter')), values: { newsletter: true } }));
  });

  route('POST', '/registrieren', async (c) => {
    const next = safeNext(c.form.weiter);
    const values = { email: c.form.email, display_name: c.form.display_name, newsletter: c.form.newsletter === '1', privacy: c.form.privacy === '1' };
    const v = validateRegistration({ email: c.form.email, displayName: c.form.display_name, password: c.form.password });
    if (!values.privacy) v.errors.push('Bitte bestätige, dass du die Datenschutzerklärung gelesen hast.');
    if (!v.errors.length && !limits.register.hit(c.ip)) v.errors.push('Von hier wurden gerade viele Konten angelegt. Bitte später erneut versuchen.');
    if (!v.errors.length && (await db.one('select 1 as x from users where email = $1', [v.email]))) {
      v.errors.push('Für diese E-Mail-Adresse gibt es schon ein Konto. Passwort vergessen?');
    }
    if (v.errors.length) return c.html(registerPage(c.view, { values, errors: v.errors, next }), 400);

    const user = await db.one(
      `insert into users (email, display_name, password_hash, is_admin, newsletter, unsubscribe_token)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [v.email, v.displayName, await hashPassword(c.form.password), config.adminEmails.includes(v.email), values.newsletter, randomToken()],
    );
    if (mailer.configured) {
      const res = await sendVerification(user);
      if (!res.ok) console.error('[mail] Bestätigung an', user.id, res.error);
    }
    const token = await createSession(db, user.id);
    c.setCookie(sessionCookie(token, { secure: config.secureCookies }));
    c.redirect(next || `/konto?ok=${mailer.configured ? 'willkommen_mail' : 'willkommen'}`);
  });

  route('GET', '/anmelden', async (c) => {
    if (c.user) return c.redirect(safeNext(c.query.get('weiter')) || '/');
    c.html(loginPage(c.view, { next: safeNext(c.query.get('weiter')) }));
  });

  route('POST', '/anmelden', async (c) => {
    const next = safeNext(c.form.weiter);
    const email = normalizeEmail(c.form.email);
    if (!limits.login.hit(`${c.ip}|${email}`)) {
      return c.html(loginPage(c.view, { email, next, error: 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' }), 429);
    }
    const user = await db.one('select id, password_hash from users where email = $1', [email]);
    // Without an account, still spend the time a hash check takes, so the
    // response time does not reveal which addresses have one.
    const ok = user ? await verifyPassword(c.form.password || '', user.password_hash) : (await hashPassword('x'), false);
    if (!ok) return c.html(loginPage(c.view, { email, next, error: 'E-Mail-Adresse oder Passwort stimmen nicht.' }), 401);
    if (config.adminEmails.includes(email)) await db.query('update users set is_admin = true where id = $1', [user.id]);
    limits.login.reset(`${c.ip}|${email}`);
    c.setCookie(sessionCookie(await createSession(db, user.id), { secure: config.secureCookies }));
    c.redirect(next || '/');
  });

  route('POST', '/abmelden', async (c) => {
    await destroySession(db, c.cookies[SESSION_COOKIE]);
    c.setCookie(clearSessionCookie({ secure: config.secureCookies }));
    c.redirect('/');
  });

  route('GET', '/konto', async (c) => {
    if (!requireUser(c)) return;
    const { rows: comments } = await db.query(
      `select c.id, c.created_at, a.slug, a.title from comments c join articles a on a.id = c.article_id
        where c.user_id = $1 order by c.created_at desc limit 50`,
      [c.user.id],
    );
    c.html(accountPage(c.view, { notice: notice(c), mailConfigured: mailer.configured, comments }));
  });

  route('POST', '/konto/newsletter', async (c) => {
    if (!requireUser(c)) return;
    await db.query('update users set newsletter = $2 where id = $1', [c.user.id, c.form.newsletter === '1']);
    c.redirect('/konto?ok=gespeichert');
  });

  route('POST', '/konto/bestaetigung-senden', async (c) => {
    if (!requireUser(c)) return;
    if (c.user.email_verified_at) return c.redirect('/konto');
    if (!limits.mail.hit(`verify${c.user.id}`)) {
      return c.html(accountPage(c.view, { error: 'Es wurden gerade schon mehrere Links verschickt. Bitte später erneut versuchen.', mailConfigured: mailer.configured, comments: [] }), 429);
    }
    const res = await sendVerification(c.user);
    if (!res.ok) return c.html(accountPage(c.view, { error: `Die E-Mail konnte nicht verschickt werden. ${res.error || ''}`, mailConfigured: mailer.configured, comments: [] }), 502);
    c.redirect('/konto?ok=gesendet');
  });

  route('GET', '/konto/bestaetigen', async (c) => {
    const userId = await consumeUserToken(db, c.query.get('token'), 'verify');
    if (!userId) {
      return c.html(messagePage(c.view, { title: 'Link ungültig', message: 'Dieser Bestätigungslink ist abgelaufen oder wurde schon benutzt. Im Konto kannst du einen neuen anfordern.', link: '/konto', linkLabel: 'Zum Konto' }), 400);
    }
    await db.query('update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1', [userId]);
    c.html(messagePage(c.view, { title: 'E-Mail-Adresse bestätigt', message: 'Danke! Deine Adresse ist bestätigt. Du kannst jetzt kommentieren, und falls du den Newsletter abonniert hast, kommt er ab dem nächsten Sitzungstag.' }));
  });

  route('POST', '/konto/loeschen', async (c) => {
    if (!requireUser(c)) return;
    const row = await db.one('select password_hash from users where id = $1', [c.user.id]);
    if (!(await verifyPassword(c.form.password || '', row.password_hash))) {
      return c.html(accountPage(c.view, { error: 'Das Passwort stimmt nicht – das Konto wurde nicht gelöscht.', mailConfigured: mailer.configured, comments: [] }), 400);
    }
    await db.query('delete from users where id = $1', [c.user.id]);
    c.setCookie(clearSessionCookie({ secure: config.secureCookies }));
    c.user = null;
    c.view.user = null;
    c.html(messagePage(c.view, { title: 'Konto gelöscht', message: 'Dein Konto und deine Kommentare sind gelöscht.' }));
  });

  route('GET', '/passwort-vergessen', async (c) => c.html(forgotPage(c.view)));

  route('POST', '/passwort-vergessen', async (c) => {
    const email = normalizeEmail(c.form.email);
    const same = { notice: 'Wenn es zu dieser Adresse ein Konto gibt, ist ein Link zum Zurücksetzen unterwegs.' };
    if (!mailer.configured || !limits.mail.hit(`reset${c.ip}`)) return c.html(forgotPage(c.view, same));
    const user = await db.one('select id, email, display_name from users where email = $1', [email]);
    if (user) {
      const token = await issueUserToken(db, user.id, 'reset', 2);
      const res = await mailer.sendMail({ to: user.email, ...resetMail(config, user, token) });
      if (!res.ok) console.error('[mail] Passwort-Reset an', user.id, res.error);
    }
    c.html(forgotPage(c.view, same));
  });

  route('GET', '/passwort-neu', async (c) => c.html(resetPage(c.view, { token: String(c.query.get('token') || '') })));

  route('POST', '/passwort-neu', async (c) => {
    const token = String(c.form.token || '');
    const pw = String(c.form.password || '');
    if (pw.length < 10 || pw.length > 200) return c.html(resetPage(c.view, { token, errors: ['Das Passwort muss mindestens 10 Zeichen lang sein.'] }), 400);
    const userId = await consumeUserToken(db, token, 'reset');
    if (!userId) return c.html(messagePage(c.view, { title: 'Link ungültig', message: 'Dieser Link ist abgelaufen oder wurde schon benutzt.', link: '/passwort-vergessen', linkLabel: 'Neuen Link anfordern' }), 400);
    // Whoever could read the inbox has shown that they own the address.
    await db.query('update users set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()) where id = $1', [userId, await hashPassword(pw)]);
    await db.query('delete from sessions where user_id = $1', [userId]);
    c.setCookie(sessionCookie(await createSession(db, userId), { secure: config.secureCookies }));
    c.redirect('/konto?ok=passwort');
  });

  route('GET', '/newsletter/abmelden', async (c) => {
    c.html(unsubscribePage(c.view, { token: String(c.query.get('t') || ''), done: false }));
  });

  route(
    'POST',
    '/newsletter/abmelden',
    async (c) => {
      const t = String(c.query.get('t') || c.form.t || '');
      const row = t ? await db.one('update users set newsletter = false where unsubscribe_token = $1 returning email', [t]) : null;
      if (!row) throw new HttpError(400, 'Dieser Abmeldelink ist ungültig.');
      c.html(unsubscribePage(c.view, { done: true, email: row.email }));
    },
    { crossOrigin: true },
  );

  // --- admin -----------------------------------------------------------------------------

  route('GET', '/admin', async (c) => {
    if (!requireAdmin(c)) return;
    const today = berlinDate();
    const counts = await db.one(`select
        (select count(*)::int from users) as users,
        (select count(*)::int from users where newsletter and email_verified_at is not null) as subscribers,
        (select count(*)::int from articles) as articles,
        (select count(*)::int from comments) as comments,
        (select count(*)::int from program_chunks) as chunks`);
    const { rows: programs } = await db.query(
      `select p.*, (select count(*)::int from program_chunks k where k.program_id = p.id) as chunk_count from programs p order by p.created_at desc`,
    );
    const { rows: articles } = await db.query('select id, slug, sitting_date, title, status, mailed_at, usage from articles order by sitting_date desc limit 30');
    const { rows: days } = await db.query(
      `select d.sitting_date, count(*)::int as n, count(*) filter (where d.importance >= 0)::int as in_depth, a.slug
         from decisions d left join articles a on a.sitting_date = d.sitting_date
        where d.sitting_date >= $1 group by d.sitting_date, a.slug order by d.sitting_date desc`,
      [addDays(today, -(config.lookbackDays + 4))],
    );
    const { rows: comments } = await db.query(
      `select c.id, c.body, c.created_at, u.display_name, u.email, a.slug, a.title
         from comments c join users u on u.id = c.user_id join articles a on a.id = c.article_id
        order by c.created_at desc limit 20`,
    );
    c.html(
      adminPage(c.view, {
        notice: notice(c),
        status: {
          dip: !!ctx.dip,
          claude: !!ctx.claude,
          mail: mailer.configured,
          voyage: !!ctx.embedder,
          database: db.kind,
          scheduler: config.scheduler,
        },
        counts,
        programs,
        articles,
        days,
        comments,
        jobs: await recentJobs(db, 30),
        suggestedDate: days.find((d) => !d.slug)?.sitting_date || addDays(today, -1),
      }),
    );
  });

  route('POST', '/admin/tick', async (c) => {
    if (!requireAdmin(c)) return;
    background('tick', () => tick(ctx, { forceSync: true }));
    c.redirect('/admin?ok=tick');
  });

  route('POST', '/admin/artikel', async (c) => {
    if (!requireAdmin(c)) return;
    const date = String(c.form.date || '');
    if (!isYmd(date)) throw new HttpError(400, 'Bitte ein gültiges Datum angeben.');
    const force = c.form.force === '1';
    background('artikel', () => runJob(db, `article:${date}`, (log) => generateArticle(ctx, date, { force, log })));
    c.redirect('/admin?ok=artikel');
  });

  route('POST', '/admin/artikel/:id/:action', async (c) => {
    if (!requireAdmin(c)) return;
    const id = Number(c.params.id) || 0;
    if (c.params.action === 'ausblenden' || c.params.action === 'einblenden') {
      await db.query('update articles set status = $2 where id = $1', [id, c.params.action === 'ausblenden' ? 'hidden' : 'published']);
      return c.redirect('/admin?ok=status');
    }
    if (c.params.action === 'versenden') {
      background('newsletter', () => runJob(db, 'newsletter', (log) => mailArticle(ctx, id, { log })));
      return c.redirect('/admin?ok=versand');
    }
    throw new HttpError(404);
  });

  function startImport(meta, getBytes) {
    return createProgram(db, meta).then((program) => {
      background('import', () =>
        runJob(db, `programm:${program.slug}`, async (log) => {
          const bytes = await getBytes();
          log(`${(bytes.length / 1024 / 1024).toFixed(1)} MB geladen`);
          return ingestProgramPdf({ db, embedder: ctx.embedder, log }, program.id, bytes);
        }).catch(async (err) => {
          await db.query(`update programs set status = 'error', error = $2 where id = $1 and status = 'processing'`, [program.id, err.message]);
          throw err;
        }),
      );
      return program;
    });
  }

  route('POST', '/admin/programme', async (c) => {
    if (!requireAdmin(c)) return;
    const v = validateProgramMeta({ party: c.form.party, title: c.form.title, kind: c.form.kind, election: c.form.election, sourceUrl: c.form.source_url });
    if (!v.meta.sourceUrl) v.errors.push('Bitte die Adresse des PDFs angeben oder eine Datei hochladen.');
    if (v.errors.length) throw new HttpError(400, v.errors.join(' '));
    await startImport(v.meta, () => downloadPdf(v.meta.sourceUrl, { fetch: ctx.fetch }));
    c.redirect('/admin?ok=import');
  });

  route(
    'POST',
    '/admin/programme/upload',
    async (c) => {
      if (!c.user || !c.user.is_admin) return c.send(403, JSON.stringify({ error: 'Nur für Admins.' }), 'application/json');
      const q = Object.fromEntries(c.query.entries());
      const v = validateProgramMeta({ party: q.party, title: q.title, kind: q.kind, election: q.election, sourceUrl: q.source_url });
      if (v.errors.length) return c.send(400, JSON.stringify({ error: v.errors.join(' ') }), 'application/json');
      const bytes = c.rawBody;
      if (!bytes || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return c.send(400, JSON.stringify({ error: 'Die Datei ist kein PDF.' }), 'application/json');
      }
      const program = await startImport(v.meta, async () => bytes);
      c.send(202, JSON.stringify({ ok: true, slug: program.slug }), 'application/json');
    },
    { raw: PDF_LIMIT },
  );

  route('POST', '/admin/programme/:id/loeschen', async (c) => {
    if (!requireAdmin(c)) return;
    await db.query('delete from programs where id = $1', [Number(c.params.id) || 0]);
    c.redirect('/admin?ok=geloescht');
  });

  // --- the request loop ---------------------------------------------------------------

  async function serveStatic(res, name) {
    if (!/^(?:fonts\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)) return false;
    const type = MIME[path.extname(name).toLowerCase()];
    if (!type) return false;
    try {
      const data = await fs.readFile(path.join(STATIC_DIR, name));
      // Fonts never change under the same name; the stylesheet's URL carries a
      // content hash (see views/layout.js), everything else is cached briefly.
      const maxAge = name.startsWith('fonts/') ? 31536000 : 3600;
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': `public, max-age=${maxAge}`, 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
      return true;
    } catch {
      return false;
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const cookies = parseCookies(req.headers.cookie);
    const c = {
      req,
      res,
      url,
      query: url.searchParams,
      cookies,
      ip: clientIp(req),
      form: {},
      params: {},
      user: null,
      extraHeaders: {},
      setCookie(v) {
        this.extraHeaders['Set-Cookie'] = [].concat(this.extraHeaders['Set-Cookie'] || [], v);
      },
      send(status, body, type) {
        if (res.headersSent) return;
        res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store', ...this.extraHeaders });
        res.end(body);
      },
      html(page, status = 200) {
        this.send(status, String(page), 'text/html; charset=utf-8');
      },
      redirect(location, status = 303) {
        if (res.headersSent) return;
        res.writeHead(status, { ...SECURITY_HEADERS, Location: location, 'Cache-Control': 'no-store', ...this.extraHeaders });
        res.end();
      },
    };

    try {
      if (req.method === 'GET' && url.pathname.startsWith('/static/')) {
        if (await serveStatic(res, url.pathname.slice('/static/'.length))) return;
      }
      if (req.method === 'GET' && url.pathname === '/favicon.ico') {
        res.writeHead(301, { Location: '/static/favicon.svg' });
        return res.end();
      }

      c.user = await sessionUser(db, cookies[SESSION_COOKIE]).catch(() => null);
      c.view = {
        config,
        user: c.user,
        path: url.pathname,
        mailConfigured: mailer.configured,
        // Without mail, nobody could ever confirm an address, so the
        // requirement only applies where mail is set up.
        requireVerified: mailer.configured,
      };

      const method = req.method === 'HEAD' ? 'GET' : req.method;
      let match = null;
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(url.pathname);
        if (m) {
          match = r;
          r.keys.forEach((k, i) => {
            try {
              c.params[k] = decodeURIComponent(m[i + 1]);
            } catch {
              c.params[k] = m[i + 1];
            }
          });
          break;
        }
      }
      if (!match) throw new HttpError(404);

      if (method === 'POST') {
        if (!match.opts.crossOrigin && !sameOrigin(req, config)) throw new HttpError(403, 'Die Anfrage kam nicht von dieser Website.');
        if (match.opts.raw) {
          c.rawBody = await readBody(req, match.opts.raw);
        } else {
          const buf = await readBody(req, FORM_LIMIT);
          const type = String(req.headers['content-type'] || '');
          if (type.startsWith('application/x-www-form-urlencoded')) c.form = Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
        }
      }
      await match.handler(c);
      if (!res.headersSent) throw new Error(`Route ${method} ${url.pathname} hat nicht geantwortet.`);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(`[http] ${req.method} ${url.pathname}:`, err);
      if (res.headersSent) return res.end();
      try {
        c.html(errorPage(c.view || { config, user: null, path: url.pathname }, status, status === 500 ? 'Da ist etwas schiefgegangen. Bitte später noch einmal versuchen.' : err.message), status);
      } catch {
        res.writeHead(status);
        res.end();
      }
    }
  }

  handle.idle = () => Promise.all([...pending]);
  return handle;
}
