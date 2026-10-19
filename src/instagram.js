// Every article on Instagram, as a carousel (views/slides.js draws the
// pictures), through the Instagram API with Instagram Login:
//
//   1. one container per picture – Instagram fetches the JPEG from this site
//   2. a carousel container with the caption
//   3. publish it, once Instagram has put the carousel together
//
// An article goes out once, when its votes are known (the plenary protocol is
// in), at most a week after the sitting. The clock posts one per tick, in
// waking hours.
//
// The access token lives 60 days, and the clock renews it every week – also
// in the recess, which is almost as long. The renewed token is kept in the
// database; a new INSTAGRAM_ACCESS_TOKEN set by hand replaces it.

import { createHash } from 'node:crypto';

import { addDays, formatDateDe } from './text.js';
import { RESULT_LABEL } from './views/labels.js';
import { slideCount } from './views/slides.js';

const API = 'https://graph.instagram.com';
// Meta answers calls to a version it has retired with the next one up, so
// this keeps working after v26.0 has gone.
const VERSION = 'v26.0';
const TIMEOUT_MS = 30000;
const MAX_AGE_DAYS = 7;
const RENEW_AFTER_DAYS = 7;
// Instagram's limit for a caption.
const CAPTION_MAX = 2200;

export function createInstagram({ fetch = globalThis.fetch } = {}) {
  // Errors carry Instagram's own message, never the address: GET requests
  // have the token in it.
  async function call(method, endpoint, params) {
    const url = new URL(endpoint.startsWith('/') ? `${API}${endpoint}` : `${API}/${VERSION}/${endpoint}`);
    const init = { method, signal: AbortSignal.timeout(TIMEOUT_MS) };
    if (method === 'GET') {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    } else {
      init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      init.body = new URLSearchParams(params).toString();
    }
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new Error(err.name === 'TimeoutError' ? 'Instagram hat nicht rechtzeitig geantwortet.' : 'Instagram ist nicht erreichbar.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const e = body.error || {};
      const err = new Error(`Instagram antwortete ${res.status}: ${e.message || 'ohne Begründung'}${e.code ? ` (Code ${e.code})` : ''}`);
      // An answer, so Instagram knows the request and turned it down.
      err.answered = true;
      throw err;
    }
    return body;
  }

  return {
    me: (token) => call('GET', 'me', { fields: 'user_id,username', access_token: token }),
    picture: (token, user, imageUrl) => call('POST', `${user}/media`, { image_url: imageUrl, is_carousel_item: 'true', access_token: token }),
    carousel: (token, user, children, caption) => call('POST', `${user}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token }),
    status: (token, id) => call('GET', id, { fields: 'status_code', access_token: token }),
    publish: (token, user, creationId) => call('POST', `${user}/media_publish`, { creation_id: creationId, access_token: token }),
    permalink: (token, id) => call('GET', id, { fields: 'permalink', access_token: token }),
    renew: (token) => call('GET', '/refresh_access_token', { grant_type: 'ig_refresh_token', access_token: token }),
  };
}

// --- the access token -----------------------------------------------------------------

const seedOf = (token) => createHash('sha256').update(token).digest('hex').slice(0, 16);

// The stored token, or the one from INSTAGRAM_ACCESS_TOKEN if that is new.
export async function accessToken(ctx) {
  const { db, config } = ctx;
  const seed = seedOf(config.instagram.accessToken);
  const row = await db.one('select * from instagram_token where id = 1');
  if (row && row.seed === seed) return row;
  return db.one(
    `insert into instagram_token (id, seed, token) values (1, $1, $2)
     on conflict (id) do update set seed = excluded.seed, token = excluded.token,
       username = '', expires_at = null, renewed_at = null, tried_at = null
     returning *`,
    [seed, config.instagram.accessToken],
  );
}

// Weekly. Meta renews a token only once it is a day old, so a failed try
// waits a day before the next.
export async function renewalDue(ctx, { now = new Date() } = {}) {
  const t = await accessToken(ctx);
  const ago = (date, days) => !date || now - new Date(date) > days * 86400000;
  return ago(t.renewed_at, RENEW_AFTER_DAYS) && ago(t.tried_at, 1);
}

export async function renewToken(ctx, { now = new Date(), log = () => {} } = {}) {
  const { db, instagram } = ctx;
  const t = await accessToken(ctx);
  await db.query('update instagram_token set tried_at = $1 where id = 1', [now]);
  const r = await instagram.renew(t.token);
  if (!r.access_token) throw new Error('Instagram hat keinen neuen Token geschickt.');
  const expires = r.expires_in ? new Date(now.getTime() + Number(r.expires_in) * 1000) : null;
  await db.query('update instagram_token set token = $1, expires_at = $2, renewed_at = $3 where id = 1', [r.access_token, expires, now]);
  log(`Token erneuert${expires ? `, gültig bis ${expires.toISOString().slice(0, 10)}` : ''}`);
  return { expiresAt: expires };
}

// --- the post -------------------------------------------------------------------------

// What goes under the pictures: the day in a few lines and where to read
// on. Links in a caption cannot be tapped, hence "Link in der Bio".
export function captionOf(config, article) {
  const decisions = ((article.body || {}).decisions || []).slice(0, slideCount(article) - 2);
  const host = new URL(config.baseUrl).host;
  const parts = (list) =>
    [
      article.title,
      article.lede,
      [`Sitzung vom ${formatDateDe(article.sitting_date)}:`, ...list.map((d) => `• ${d.headline} (${(RESULT_LABEL[d.result] || d.result || '').toLowerCase()})`)].join('\n'),
      `Alles mit Quellen, Abstimmungen und Diskussion: ${host}/artikel/${article.slug} (Link in der Bio)`,
      'Die Texte schreibt eine KI auf Grundlage der Dokumente des Bundestags.',
      '#Bundestag #Politik',
    ]
      .filter(Boolean)
      .join('\n\n');
  let list = decisions;
  let caption = parts(list);
  while (caption.length > CAPTION_MAX && list.length) caption = parts((list = list.slice(0, -1)));
  return caption.slice(0, CAPTION_MAX);
}

// Published articles of the last week whose votes are known and that have
// not gone out, oldest first.
export async function pendingPosts(db, { today }) {
  const { rows } = await db.query(
    `select id, sitting_date from articles
      where status = 'published' and instagram_at is null and sitting_date >= $1
        and coalesce((body->>'protocolAvailable')::boolean, false)
      order by sitting_date`,
    [addDays(today, -MAX_AGE_DAYS)],
  );
  return rows;
}

// The pictures' addresses carry the article's version, so a rewrite is never
// mistaken for the picture Instagram fetched before.
export const pictureUrl = (config, article, n) => `${config.baseUrl}/instagram/${article.slug}/${n}.jpg?v=${new Date(article.created_at).getTime().toString(36)}`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function postArticle(ctx, articleId, { log = () => {}, pauseMs = 3000 } = {}) {
  const { db, config, instagram } = ctx;
  // Instagram fetches the pictures itself, so they have to be on the internet.
  if (!/^https:\/\//.test(config.baseUrl)) throw new Error(`Instagram kann die Bilder von ${config.baseUrl} nicht abholen – BASE_URL muss eine öffentliche https-Adresse sein.`);
  const article = await db.one('select * from articles where id = $1', [articleId]);
  if (!article) throw new Error('Diesen Artikel gibt es nicht.');
  if (article.instagram_at) return { skipped: 'schon gepostet' };

  const { token } = await accessToken(ctx);
  const me = await instagram.me(token);
  const user = me.user_id || me.id;
  if (me.username) await db.query('update instagram_token set username = $1 where id = 1', [me.username]);

  const children = [];
  for (let n = 1; n <= slideCount(article); n++) children.push((await instagram.picture(token, user, pictureUrl(config, article, n))).id);
  const carousel = await instagram.carousel(token, user, children, captionOf(config, article));
  log(`Karussell mit ${children.length} Bildern angelegt`);
  for (let i = 0; ; i++) {
    const { status_code: status } = await instagram.status(token, carousel.id);
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED' || i >= 9) throw new Error(`Instagram ist mit dem Karussell nicht fertig geworden (${status || 'ohne Status'}).`);
    await wait(pauseMs);
  }

  // Claimed before it goes out, like a letter: a run that dies between
  // publishing and writing that down must not post the article twice.
  if (!(await db.one('update articles set instagram_at = now() where id = $1 and instagram_at is null returning id', [article.id]))) {
    return { skipped: 'schon gepostet' };
  }
  let media;
  try {
    media = await instagram.publish(token, user, carousel.id);
  } catch (err) {
    // Turned down: nothing went out, a later tick tries again. No answer at
    // all: it may have gone out, and a missing post is better than a double.
    if (err.answered) await db.query('update articles set instagram_at = null where id = $1', [article.id]);
    else log('Ob der Beitrag erschienen ist, zeigt nur Instagram selbst; er wird nicht noch einmal gepostet.');
    throw err;
  }
  let url = '';
  try {
    const { permalink } = await instagram.permalink(token, media.id);
    if (/^https:\/\//.test(permalink || '')) url = permalink;
  } catch (err) {
    log(`Adresse des Beitrags: ${err.message}`);
  }
  await db.query('update articles set instagram_url = $2 where id = $1', [article.id, url]);
  log(`Gepostet: ${url || media.id}`);
  return { id: media.id, url };
}
