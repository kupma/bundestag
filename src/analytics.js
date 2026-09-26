// Visitor statistics without cookies and without a third party. The server
// counts the pages it delivers; a visitor is told apart only by a hash of IP
// address, browser and a random salt that is replaced every day, and the old
// salts are deleted – so a visitor cannot be recognised across days, and the
// hashes cannot be turned back into IP addresses. Nothing is stored on the
// reader's device, so there is nothing to consent to.

import crypto from 'node:crypto';

import { berlinDate } from './text.js';

const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|archiver|facebookexternalhit|whatsapp|telegram|embedly|preview|monitor|uptime|pingdom|lighthouse|headless|curl|wget|python|httpclient|axios|node-fetch|undici|go-http|java\/|scrapy|feedfetcher|rss|okhttp|railway/i;

// Pages worth counting: what readers see. Not the admin area, not machines.
const SKIP_RE = /^\/(admin|api|static|healthz|konto|feed\.xml|sitemap|robots\.txt|newsletter)/;

export function isBot(ua) {
  return !ua || BOT_RE.test(ua);
}

export function deviceOf(ua) {
  const s = String(ua || '');
  if (/iPad|Tablet/i.test(s)) return 'Tablet';
  if (/Mobi|Android|iPhone/i.test(s)) return 'Mobil';
  return 'Desktop';
}

export function referrerHost(referer, ownHost) {
  if (!referer) return '';
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^www\./, '');
    const own = String(ownHost || '').toLowerCase().replace(/^www\./, '');
    return host && host !== own ? host.slice(0, 120) : '';
  } catch {
    return '';
  }
}

// Search engines and social networks under one readable name, so the report
// says "Google" rather than listing google.de, google.com, google.at …
export function sourceName(host) {
  const h = String(host || '');
  const known = [
    [/(^|\.)google\./, 'Google'],
    [/(^|\.)bing\.com$/, 'Bing'],
    [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
    [/(^|\.)ecosia\.org$/, 'Ecosia'],
    [/(^|\.)qwant\.com$/, 'Qwant'],
    [/(^|\.)startpage\.com$/, 'Startpage'],
    [/(^|\.)yahoo\./, 'Yahoo'],
    [/(^|\.)(facebook\.com|fb\.me)$/, 'Facebook'],
    [/(^|\.)instagram\.com$/, 'Instagram'],
    [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X'],
    [/(^|\.)bsky\.app$/, 'Bluesky'],
    [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
    [/(^|\.)reddit\.com$/, 'Reddit'],
    [/(^|\.)(mastodon|social)\./, 'Mastodon'],
    [/(^|\.)threads\.net$/, 'Threads'],
    [/(^|\.)youtube\.com$/, 'YouTube'],
    [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT'],
    [/(^|\.)perplexity\.ai$/, 'Perplexity'],
    [/(^|\.)claude\.ai$/, 'Claude'],
  ];
  for (const [re, name] of known) if (re.test(h)) return name;
  return h;
}

export function shouldCount({ method, path, status, ua, user }) {
  if (method !== 'GET' || status !== 200) return false;
  if (SKIP_RE.test(path)) return false;
  if (user && user.is_admin) return false; // the operator's own clicks are not traffic
  return !isBot(ua);
}

export function createTracker(db, { now = () => new Date() } = {}) {
  let cached = { day: '', salt: '' };

  async function saltFor(day) {
    if (cached.day === day) return cached.salt;
    await db.query('insert into analytics_salts (day, salt) values ($1, $2) on conflict (day) do nothing', [
      day,
      crypto.randomBytes(24).toString('hex'),
    ]);
    const row = await db.one('select salt from analytics_salts where day = $1', [day]);
    await db.query('delete from analytics_salts where day < $1', [day]);
    cached = { day, salt: row.salt };
    return row.salt;
  }

  return async function record({ path, referer, ua, ip, ownHost, query }) {
    const day = berlinDate(now());
    const salt = await saltFor(day);
    const visitor = crypto.createHash('sha256').update(`${salt}|${ip}|${ua}`).digest('hex').slice(0, 20);
    const source = String((query && (query.get('utm_source') || query.get('ref'))) || '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 40);
    await db.query(
      `insert into page_views (day, path, referrer, source, device, visitor) values ($1, $2, $3, $4, $5, $6)`,
      [day, String(path).slice(0, 200), referrerHost(referer, ownHost), source, deviceOf(ua), visitor],
    );
  };
}

// Everything the statistics page shows, for the last `days` days.
export async function trafficReport(db, { days = 30, today = berlinDate(new Date()) } = {}) {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
  const range = [from, today];
  const { rows: daily } = await db.query(
    `select day::text as day, count(*)::int as views, count(distinct visitor)::int as visitors
       from page_views where day between $1 and $2 group by day order by day`,
    range,
  );
  const byDay = new Map(daily.map((r) => [r.day, r]));
  const series = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    series.push(byDay.get(day) || { day, views: 0, visitors: 0 });
  }
  const top = (col, where = 'true', limit = 15) =>
    db
      .query(
        `select ${col} as key, count(*)::int as views, count(distinct (day, visitor))::int as visitors
           from page_views where day between $1 and $2 and ${where}
          group by ${col} order by visitors desc, views desc limit ${limit}`,
        range,
      )
      .then((r) => r.rows);
  const [pages, referrers, sources, devices] = await Promise.all([
    top('path'),
    top('referrer', `referrer <> ''`, 40),
    top('source', `source <> ''`),
    top('device'),
  ]);
  // Referrers merged by source name (all Googles are Google).
  const merged = new Map();
  for (const r of referrers) {
    const name = sourceName(r.key);
    const m = merged.get(name) || { key: name, views: 0, visitors: 0 };
    m.views += r.views;
    m.visitors += r.visitors;
    merged.set(name, m);
  }
  const live = await db.one(
    `select count(distinct visitor)::int as n from page_views where created_at > now() - interval '30 minutes'`,
  );
  const sum = (k) => series.reduce((n, r) => n + r[k], 0);
  const last = (n, k) => series.slice(-n).reduce((s, r) => s + r[k], 0);
  return {
    from,
    today,
    series,
    totals: {
      visits: sum('visitors'),
      views: sum('views'),
      today: series[series.length - 1],
      week: { visits: last(7, 'visitors'), views: last(7, 'views') },
      live: live ? live.n : 0,
    },
    pages,
    referrers: [...merged.values()].sort((a, b) => b.visitors - a.visitors).slice(0, 15),
    sources,
    devices,
  };
}

export async function pruneTraffic(db, keepDays = 400) {
  await db.query(`delete from page_views where day < current_date - $1::int`, [keepDays]);
}
