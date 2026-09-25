import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { html } from '../html.js';
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
export const ASSET_VERSION = { css: version('styles.css'), adminJs: version('admin.js') };

const NAV = [
  ['/', 'Sitzungstage'],
  ['/mitmachen', 'Mitmachen'],
  ['/programme', 'Bibliothek'],
  ['/ueber', 'Über uns'],
];

export function layout(view, { title, description = '', body, canonical = '', noindex = false }) {
  const { config, user, path: current = '/' } = view;
  const fullTitle = title ? `${title} – ${config.siteName}` : `${config.siteName} – Was versprochen war, was beschlossen wurde`;
  const active = (href) =>
    href === '/' ? current === '/' || current.startsWith('/artikel') || current.startsWith('/archiv') : current.startsWith(href);

  return html`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
${description ? html`<meta name="description" content="${description}">` : ''}
${canonical ? html`<link rel="canonical" href="${config.baseUrl}${canonical}">` : ''}
${noindex ? html`<meta name="robots" content="noindex">` : ''}
<meta property="og:title" content="${title || config.siteName}">
${description ? html`<meta property="og:description" content="${description}">` : ''}
<meta name="theme-color" content="#f6f3ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1c1b19" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/static/fonts/figtree.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/static/fonts/fraunces-soft.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/static/styles.css?v=${ASSET_VERSION.css}">
<link rel="alternate" type="application/rss+xml" title="${config.siteName}" href="/feed.xml">
</head>
<body>
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
<main id="inhalt" class="wrap">
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
