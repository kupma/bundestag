// What search engines read besides the pages: robots.txt, the sitemaps, the
// web app manifest, and the IndexNow ping that announces a new article to
// Bing, Yandex, Seznam and others the moment it is out (Google reads the
// sitemap and the RSS feed).

import { escapeHtml } from './html.js';

const x = (s) => escapeHtml(s);
const iso = (d) => new Date(d).toISOString();

export const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/archiv', changefreq: 'daily', priority: '0.8' },
  { path: '/mitmachen', changefreq: 'monthly', priority: '0.6' },
  { path: '/programme', changefreq: 'monthly', priority: '0.6' },
  { path: '/ueber', changefreq: 'monthly', priority: '0.5' },
];

export function robotsTxt(config) {
  return [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /konto',
    'Disallow: /api/',
    'Disallow: /newsletter/',
    '',
    `Sitemap: ${config.baseUrl}/sitemap.xml`,
    `Sitemap: ${config.baseUrl}/news-sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml(config, { articles, programs }) {
  const newest = articles.length ? iso(articles[0].updated_at || articles[0].published_at) : '';
  const urls = [
    ...STATIC_PAGES.map((p) => ({ ...p, lastmod: p.path === '/' || p.path === '/archiv' ? newest : '' })),
    ...articles.map((a) => ({ path: `/artikel/${a.slug}`, lastmod: iso(a.updated_at || a.published_at), changefreq: 'weekly', priority: '0.9' })),
    ...programs.map((p) => ({ path: `/programme/${p.slug}`, lastmod: p.created_at ? iso(p.created_at) : '', changefreq: 'yearly', priority: '0.4' })),
  ];
  const body = urls
    .map(
      (u) =>
        `<url><loc>${x(config.baseUrl + u.path)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

// Google News reads only the last two days.
export function newsSitemapXml(config, { articles, now = new Date() }) {
  const recent = articles.filter((a) => now - new Date(a.published_at) < 2 * 86400000);
  const body = recent
    .map(
      (a) =>
        `<url><loc>${x(`${config.baseUrl}/artikel/${a.slug}`)}</loc><news:news><news:publication><news:name>${x(config.siteName)}</news:name><news:language>de</news:language></news:publication><news:publication_date>${iso(a.published_at)}</news:publication_date><news:title>${x(a.title)}</news:title></news:news></url>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${body}</urlset>`;
}

export function manifest(config) {
  return JSON.stringify({
    name: config.siteName,
    short_name: config.siteName,
    description: 'Was der Bundestag beschließt – abgeglichen mit den Wahlprogrammen der Parteien.',
    lang: 'de',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f3ee',
    theme_color: '#f6f3ee',
    icons: [
      { src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/static/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  });
}

// https://www.indexnow.org/documentation – one POST for all new addresses.
// Best effort: a failed ping costs nothing but a few hours until the crawler
// comes by anyway.
export async function pingIndexNow(ctx, paths, log = () => {}) {
  const { config } = ctx;
  const key = config.seo.indexNowKey;
  if (!key || !paths.length || !/^https:\/\//.test(config.baseUrl)) return false;
  const host = new URL(config.baseUrl).host;
  try {
    const res = await (ctx.fetch || globalThis.fetch)('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${config.baseUrl}/${key}.txt`, urlList: paths.map((p) => config.baseUrl + p) }),
      signal: AbortSignal.timeout(15000),
    });
    log(`IndexNow: ${res.status}`);
    return res.ok;
  } catch (err) {
    log(`IndexNow: ${err.message}`);
    return false;
  }
}
