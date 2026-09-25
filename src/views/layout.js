import { html } from '../html.js';

export function layout(view, { title, description = '', body, canonical = '', noindex = false }) {
  const { config, user, path = '/' } = view;
  const fullTitle = title ? `${title} – ${config.siteName}` : config.siteName;
  const nav = [
    ['/', 'Artikel'],
    ['/archiv', 'Archiv'],
    ['/programme', 'Bibliothek'],
    ['/ueber', 'Über das Projekt'],
  ];
  const active = (href) => (href === '/' ? path === '/' || path.startsWith('/artikel') : path.startsWith(href));

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
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/styles.css">
<link rel="alternate" type="application/rss+xml" title="${config.siteName}" href="/feed.xml">
</head>
<body>
<a class="skip" href="#inhalt">Zum Inhalt springen</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">§</span>${config.siteName}</a>
    <nav class="site-nav" aria-label="Hauptnavigation">
      ${nav.map(([href, label]) => html`<a href="${href}"${active(href) ? html` aria-current="page"` : ''}>${label}</a>`)}
    </nav>
    <div class="account-nav">
      ${user
        ? html`<a href="/konto">${user.display_name}</a>${user.is_admin ? html` · <a href="/admin">Admin</a>` : ''}`
        : html`<a href="/anmelden">Anmelden</a> <a class="button small" href="/registrieren">Registrieren</a>`}
    </div>
  </div>
</header>
<main id="inhalt" class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <p>Was der Bundestag beschließt – und was die Parteien vorher versprochen haben. Daten: <a href="https://dip.bundestag.de">DIP des Deutschen Bundestags</a> und die Wahlprogramme der Parteien. Analysen mit KI, jede Fundstelle verlinkt.</p>
    <p><a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="/feed.xml">RSS</a> · <a href="/ueber#methode">Methode</a></p>
  </div>
</footer>
</body>
</html>`;
}

export function notices({ notice, error, errors } = {}) {
  const list = [...(errors || []), ...(error ? [error] : [])];
  return html`${notice ? html`<div class="notice" role="status">${notice}</div>` : ''}${
    list.length ? html`<div class="notice error" role="alert">${list.length === 1 ? list[0] : html`<ul>${list.map((e) => html`<li>${e}</li>`)}</ul>`}</div>` : ''
  }`;
}
