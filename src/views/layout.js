import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { html, raw } from '../html.js';
import { logoMark } from './shapes.js';

// Cache-busting: the stylesheet is cached for an hour, so its URL carries a
// hash of its content and a deploy with new styles is picked up at once.
const STATIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'static');
const version = (file) => {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(path.join(STATIC_DIR, file))).digest('hex').slice(0, 10);
  } catch {
    return 'dev';
  }
};
export const ASSET_VERSION = { css: version('styles.css'), adminJs: version('admin.js'), landingJs: version('landing.js') };

const NAV = [
  ['/archiv', 'Sitzungstage'],
  ['/mitmachen', 'Mitmachen'],
  ['/programme', 'Bibliothek'],
  ['/ueber', 'Über uns'],
];

export const TAGLINE = 'Was versprochen war. Was beschlossen wurde.';
export const DEFAULT_DESCRIPTION =
  'Nach jedem Sitzungstag des Bundestags: alle Beschlüsse im Abgleich mit den Wahlprogrammen von Linken, Grünen, SPD, CDU/CSU und AfD – mit wörtlichen Zitaten, Fundstellen und Abstimmungsverhalten. Überparteilich und ruhig.';

// Structured data for search engines, as JSON that cannot close its tag.
const jsonLd = (data) => raw(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);

export function organization(config) {
  return {
    '@type': 'Organization',
    '@id': `${config.baseUrl}/#organisation`,
    name: config.siteName,
    url: `${config.baseUrl}/`,
    logo: { '@type': 'ImageObject', url: `${config.baseUrl}/static/icon-512.png`, width: 512, height: 512 },
  };
}

export function layout(
  view,
  { title, description = '', body, canonical, noindex = false, ogType = 'website', image = '', structured = [], scripts = [], bodyClass = '', published = '', modified = '' },
) {
  const { config, user, path: current = '/' } = view;
  const fullTitle = title ? `${title} – ${config.siteName}` : `${config.siteName} – ${TAGLINE}`;
  const desc = description || DEFAULT_DESCRIPTION;
  // Every indexable page names its one address; query strings (utm_…, ?ok=)
  // never make a second one.
  const canonicalPath = canonical ?? (noindex ? '' : current);
  const pageUrl = canonicalPath ? `${config.baseUrl}${canonicalPath}` : '';
  const img = image || `${config.baseUrl}/static/og.png`;
  const active = (href) => (href === '/archiv' ? current.startsWith('/artikel') || current.startsWith('/archiv') : current.startsWith(href));
  const { seo, plausible } = config;

  return html`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
${pageUrl ? html`<link rel="canonical" href="${pageUrl}">` : ''}
${noindex ? html`<meta name="robots" content="noindex">` : html`<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`}
<meta property="og:site_name" content="${config.siteName}">
<meta property="og:locale" content="de_DE">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${title || `${config.siteName} – ${TAGLINE}`}">
<meta property="og:description" content="${desc}">
${pageUrl ? html`<meta property="og:url" content="${pageUrl}">` : ''}
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${config.siteName}: zwei Kreise – versprochen und beschlossen">
${published ? html`<meta property="article:published_time" content="${published}">` : ''}
${modified ? html`<meta property="article:modified_time" content="${modified}">` : ''}
<meta name="twitter:card" content="summary_large_image">
${seo.googleVerification ? html`<meta name="google-site-verification" content="${seo.googleVerification}">` : ''}
${seo.bingVerification ? html`<meta name="msvalidate.01" content="${seo.bingVerification}">` : ''}
<meta name="theme-color" content="#f6f3ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1c1b19" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/static/fonts/figtree.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/static/fonts/fraunces-soft.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/static/styles.css?v=${ASSET_VERSION.css}">
<link rel="alternate" type="application/rss+xml" title="${config.siteName}" href="/feed.xml">
${structured.filter(Boolean).map(jsonLd)}
${scripts.map((s) => html`<script src="/static/${s}.js?v=${ASSET_VERSION[`${s}Js`] || ''}" defer></script>`)}
${plausible.domain ? html`<script defer data-domain="${plausible.domain}" src="${plausible.src}"></script>` : ''}
</head>
<body${bodyClass ? html` class="${bodyClass}"` : ''}>
<a class="skip" href="#inhalt">Zum Inhalt springen</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">${logoMark()}<span>${config.siteName}</span></a>
    <nav class="site-nav" aria-label="Hauptnavigation">
      ${NAV.map(([href, label]) => html`<a href="${href}"${active(href) ? html` aria-current="page"` : ''}>${label}</a>`)}
    </nav>
    <div class="account-nav">
      ${user
        ? html`<a href="/konto">${user.display_name}</a>${user.is_admin ? html`<a href="/admin">Admin</a>` : ''}`
        : html`<a href="/anmelden">Anmelden</a><a class="button small hide-sm" href="/registrieren">Registrieren</a>`}
    </div>
  </div>
</header>
<main id="inhalt"${bodyClass.includes('landing') ? '' : html` class="wrap"`}>
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div>
      <p><strong>${config.siteName}</strong> – was der Bundestag beschließt, was die Parteien versprochen haben, und was jede und jeder selbst beitragen kann. Überparteilich und ohne Aufregung.</p>
      <p class="meta">Daten: <a href="https://dip.bundestag.de">DIP des Deutschen Bundestags</a> und die Wahlprogramme der Parteien. Einordnung mit KI, jede Fundstelle verlinkt.</p>
    </div>
    <nav class="footer-links" aria-label="Weitere Seiten">
      <a href="/archiv">Archiv</a><a href="/ueber#methode">Methode</a><a href="/mitmachen">Mitmachen</a><a href="/feed.xml">RSS</a><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a>
    </nav>
  </div>
</footer>
</body>
</html>`;
}

export function notices({ notice, error, errors } = {}) {
  const list = [...(errors || []), ...(error ? [error] : [])];
  return html`${notice ? html`<div class="notice" role="status"><div>${notice}</div></div>` : ''}${
    list.length
      ? html`<div class="notice error" role="alert"><div>${list.length === 1 ? list[0] : html`<ul>${list.map((e) => html`<li>${e}</li>`)}</ul>`}</div></div>`
      : ''
  }`;
}
