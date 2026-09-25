import { escapeHtml, html, paragraphs, raw } from '../html.js';
import { KINDS, partyClass } from '../programs.js';
import { formatDateDe, formatDateTimeDe, truncate } from '../text.js';
import { ALIGNMENT_LABEL, cls, RESULT_LABEL, VOTE_LABEL } from './labels.js';
import { layout, notices } from './layout.js';

function articleCard(a, { big = false } = {}) {
  return html`<article class="card${big ? ' card-big' : ''}">
    <p class="kicker">Sitzung vom ${formatDateDe(a.sitting_date)}</p>
    <h${big ? '2' : '3'} class="card-title"><a href="/artikel/${a.slug}">${a.title}</a></h${big ? '2' : '3'}>
    <p class="card-lede">${a.lede}</p>
    <p class="meta">${a.decision_count ?? ''}${a.decision_count != null ? ' Beschlüsse im Abgleich · ' : ''}${a.comment_count || 0} Kommentar${Number(a.comment_count) === 1 ? '' : 'e'}</p>
  </article>`;
}

export function homePage(view, { articles, programCount }) {
  const [first, ...rest] = articles;
  const body = html`
  ${!view.user
    ? html`<section class="hero">
      <h1>Was beschlossen wurde. Und was versprochen war.</h1>
      <p>Nach jedem Sitzungstag des Bundestags gleichen wir die Beschlüsse mit den Wahlprogrammen der Parteien ab – mit direkten Links auf die Seite im Programm, auf der das Versprechen steht.</p>
      <p><a class="button" href="/registrieren">Kostenlos registrieren &amp; Newsletter erhalten</a> <a class="button ghost" href="/ueber">So funktioniert es</a></p>
    </section>`
    : ''}
  ${first
    ? html`<section aria-label="Neuester Artikel">${articleCard(first, { big: true })}</section>
      ${rest.length ? html`<section class="list"><h2 class="section-title">Frühere Sitzungstage</h2>${rest.map((a) => articleCard(a))}<p><a href="/archiv">Alle Artikel im Archiv →</a></p></section>` : ''}`
    : html`<section class="empty">
      <h2>Noch kein Artikel</h2>
      <p>Der erste Artikel erscheint am Morgen nach dem nächsten Sitzungstag des Bundestags${programCount ? '' : ', sobald die Wahlprogramme in der Bibliothek sind'}.</p>
    </section>`}`;
  return layout(view, {
    title: '',
    description: 'Was der Bundestag beschließt – abgeglichen mit den Wahlprogrammen der Parteien, mit Fundstellen.',
    body,
    canonical: '/',
  });
}

export function archivePage(view, { articles }) {
  const byMonth = new Map();
  for (const a of articles) {
    const month = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${a.sitting_date}T12:00:00Z`));
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(a);
  }
  const body = html`<h1>Archiv</h1>
  ${articles.length
    ? [...byMonth.entries()].map(
        ([month, list]) => html`<section class="archive-month"><h2 class="section-title">${month}</h2>
        <ul class="archive-list">${list.map(
          (a) => html`<li><span class="archive-date">${formatDateDe(a.sitting_date)}</span> <a href="/artikel/${a.slug}">${a.title}</a> <span class="meta">· ${a.comment_count || 0} Kommentar${Number(a.comment_count) === 1 ? '' : 'e'}</span></li>`,
        )}</ul></section>`,
      )
    : html`<p>Noch keine Artikel.</p>`}`;
  return layout(view, { title: 'Archiv', body, canonical: '/archiv' });
}

function citationList(p) {
  if (!p.citations.length) return '';
  return html`<ul class="citations">${p.citations.map(
    (c) => html`<li>
      ${c.quote ? html`<blockquote>„${c.quote}“</blockquote>` : ''}
      <span class="cite-links"><a href="/stelle/${c.chunkId}">${KINDS[p.kind] || 'Dokument'} ${p.party}, PDF-S. ${c.page}</a>${
        c.url ? html` · <a href="${c.url}" target="_blank" rel="noopener">Original-PDF ↗</a>` : ''
      }</span>
    </li>`,
  )}</ul>`;
}

function partyCard(p) {
  const vote = VOTE_LABEL[p.vote];
  return html`<div class="party align-${cls(p.alignment)} ${partyClass(p.party)}">
    <div class="party-head">
      <span class="dot" aria-hidden="true"></span>
      <strong>${p.party}</strong>
      <span class="kind">${KINDS[p.kind] || ''}</span>
    </div>
    <div class="chips">
      <span class="chip align">${ALIGNMENT_LABEL[p.alignment] || p.alignment}</span>
      ${vote ? html`<span class="chip vote vote-${cls(p.vote)}">${vote}</span>` : ''}
    </div>
    <p>${p.assessment}</p>
    ${citationList(p)}
  </div>`;
}

function decisionSection(d, i) {
  return html`<section class="decision" id="beschluss-${i + 1}">
    <h2>${d.headline}</h2>
    <p class="official"><span class="result result-${cls(d.result)}">${RESULT_LABEL[d.result] || d.result}</span> ${d.vorgangstyp ? html`<span class="typ">${d.vorgangstyp}</span>` : ''} <span class="official-title">${d.title}</span></p>
    <p>${d.summary}</p>
    ${d.votesNote ? html`<p class="votes"><strong>Abstimmung:</strong> ${d.votesNote}</p>` : ''}
    <h3 class="compare-title">Was in den Programmen steht</h3>
    <div class="compare">${d.parties.map(partyCard)}</div>
    ${d.sources.length ? html`<p class="sources">Quellen: ${d.sources.map((s, j) => html`${j ? ' · ' : ''}<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`)}</p>` : ''}
  </section>`;
}

function commentsSection(view, { article, comments, commentError, commentDraft }) {
  const { user } = view;
  const back = encodeURIComponent(`/artikel/${article.slug}#kommentare`);
  let form;
  if (!user) {
    form = html`<p class="login-hint"><a href="/anmelden?weiter=${back}">Anmelden</a> oder <a href="/registrieren?weiter=${back}">registrieren</a>, um mitzudiskutieren.</p>`;
  } else if (view.requireVerified && !user.email_verified_at) {
    form = html`<p class="login-hint">Bitte bestätige zuerst deine E-Mail-Adresse, um zu kommentieren. <a href="/konto">Bestätigungslink erneut senden</a></p>`;
  } else {
    form = html`<form method="post" action="/artikel/${article.slug}/kommentare" class="comment-form">
      ${notices({ error: commentError })}
      <label for="comment-body">Dein Kommentar <span class="meta">(als ${user.display_name})</span></label>
      <textarea id="comment-body" name="body" rows="4" maxlength="4000" required>${commentDraft || ''}</textarea>
      <p class="meta">Sachlich bleiben: Beleidigungen, Hetze und Werbung werden gelöscht.</p>
      <button type="submit">Kommentar veröffentlichen</button>
    </form>`;
  }
  return html`<section class="comments" id="kommentare">
    <h2>Kommentare (${comments.length})</h2>
    ${comments.length
      ? html`<ol class="comment-list">${comments.map(
          (c) => html`<li class="comment" id="kommentar-${c.id}">
            <p class="comment-meta"><strong>${c.display_name}</strong> · <time datetime="${new Date(c.created_at).toISOString()}">${formatDateTimeDe(c.created_at)}</time></p>
            ${paragraphs(c.body)}
            ${user && (user.id === c.user_id || user.is_admin)
              ? html`<form method="post" action="/kommentare/${c.id}/loeschen" class="inline"><button class="link danger" type="submit">Löschen</button></form>`
              : ''}
          </li>`,
        )}</ol>`
      : html`<p class="meta">Noch keine Kommentare.</p>`}
    ${form}
  </section>`;
}

export function articlePage(view, data) {
  const { article } = data;
  const b = article.body || {};
  const decisions = b.decisions || [];
  const body = html`<article class="article">
    <p class="kicker">Sitzung des Bundestags vom ${formatDateDe(article.sitting_date)}</p>
    <h1>${article.title}</h1>
    <p class="lede">${article.lede}</p>
    <p class="meta">Veröffentlicht ${formatDateTimeDe(article.published_at)} · ${decisions.length} Beschlüsse im Abgleich mit ${(b.programs || []).length} Programmen · <a href="#kommentare">${data.comments.length} Kommentar${data.comments.length === 1 ? '' : 'e'}</a></p>
    ${article.status === 'hidden' ? html`<div class="notice error">Dieser Artikel ist ausgeblendet und nur für Admins sichtbar.</div>` : ''}
    <div class="intro">${(b.intro || []).map((p) => html`<p>${p}</p>`)}</div>
    ${decisions.length > 1
      ? html`<nav class="toc" aria-label="Beschlüsse in diesem Artikel"><h2>Die Beschlüsse</h2><ol>${decisions.map(
          (d, i) => html`<li><a href="#beschluss-${i + 1}">${d.headline}</a> <span class="result result-${cls(d.result)}">${RESULT_LABEL[d.result] || d.result}</span></li>`,
        )}</ol></nav>`
      : ''}
    ${decisions.map(decisionSection)}
    ${(b.others || []).length
      ? html`<section class="others"><h2>Weitere Beschlüsse des Tages</h2><ul>${b.others.map(
          (o) => html`<li>${o.title} <span class="meta">– ${o.tenor || RESULT_LABEL[o.outcome] || o.outcome}</span></li>`,
        )}</ul></section>`
      : ''}
    <aside class="disclaimer">
      <p><strong>So entsteht dieser Artikel:</strong> Die Beschlüsse stammen aus der Parlamentsdokumentation (DIP) des Bundestags, das Abstimmungsverhalten aus dem Plenarprotokoll. Die Einordnung schreibt eine KI (Claude von Anthropic) ausschließlich auf Grundlage dieser Dokumente und der verlinkten Programmpassagen. Jedes Zitat wird vor der Veröffentlichung automatisch mit dem Programmtext abgeglichen; Einordnungen ohne überprüfbare Fundstelle werden zurückgezogen. Fehler sind trotzdem möglich – die Fundstellen sind verlinkt, damit du selbst nachlesen kannst. <a href="/ueber#methode">Mehr zur Methode</a></p>
    </aside>
  </article>
  ${commentsSection(view, data)}`;
  return layout(view, { title: article.title, description: truncate(article.lede, 200), body, canonical: `/artikel/${article.slug}` });
}

export function aboutPage(view, { programs }) {
  const body = html`<article class="prose">
  <h1>Über das Projekt</h1>
  <p>Vor der Wahl schreiben Parteien auf, was sie vorhaben. Danach entscheidet der Bundestag – oft über Dinge, die in keinem Programm standen, manchmal genau über das, was versprochen war, und manchmal über das Gegenteil. ${view.config.siteName} legt beides nebeneinander: jeden Sitzungstag, jeden wichtigen Beschluss, jede Partei.</p>
  <h2 id="methode">Methode</h2>
  <ol>
    <li><strong>Beschlüsse:</strong> Wir lesen die Parlamentsdokumentation <a href="https://dip.bundestag.de">DIP</a> des Bundestags aus. Als Beschluss zählt jede Abstimmung im Plenum über eine Vorlage – Überweisungen an Ausschüsse zählen nicht. Gesetze und namentliche Abstimmungen kommen zuerst; Petitionen und Wahlen stehen am Ende unter „Weitere Beschlüsse“.</li>
    <li><strong>Abstimmungsverhalten:</strong> Wie die Fraktionen gestimmt haben, steht im Plenarprotokoll. Wir suchen dort die Abstimmungsformel zum jeweiligen Beschluss („mit den Stimmen der … gegen die Stimmen der …“). Liegt das Protokoll noch nicht vor, steht „Abstimmung unbekannt“.</li>
    <li><strong>Bibliothek:</strong> Die Wahlprogramme liegen als PDF vor. Wir zerlegen sie in kurze Passagen, von denen jede genau eine Seite hat, und indexieren sie für die Volltextsuche. Die <a href="/programme">Bibliothek</a> ist öffentlich durchsuchbar.</li>
    <li><strong>Suche:</strong> Für jeden Beschluss formuliert eine KI Suchbegriffe, wie sie in Wahlprogrammen vorkommen, und wir suchen in jedem Programm getrennt nach den passendsten Passagen.</li>
    <li><strong>Einordnung:</strong> Die KI (Claude von Anthropic) vergleicht den Beschluss mit diesen Passagen und ordnet für jedes Programm ein: <em>entspricht</em>, <em>teilweise</em>, <em>widerspricht</em> oder <em>nicht thematisiert</em>. Sie darf dabei nur die gelieferten Dokumente verwenden.</li>
    <li><strong>Prüfung:</strong> Bevor ein Artikel erscheint, prüft ein Programm jedes Zitat Zeichen für Zeichen gegen den Programmtext. Nicht auffindbare Zitate werden gestrichen; eine Einordnung ohne belegbare Fundstelle wird zurückgezogen.</li>
  </ol>
  <p>Seitenangaben beziehen sich auf die Seite im PDF, nicht auf die gedruckte Seitenzahl. Die Links „Original-PDF“ öffnen die Datei der Partei direkt auf dieser Seite.</p>
  <h2>Grenzen</h2>
  <p>Eine KI kann sich irren, eine Suche kann die passende Stelle übersehen, und Programme sind oft allgemeiner formuliert als Gesetze. „Nicht thematisiert“ heißt deshalb: In den gefundenen Passagen steht nichts dazu – nicht, dass die Partei keine Meinung hat. Wenn dir ein Fehler auffällt, schreib es in die Kommentare.</p>
  <h2>In der Bibliothek</h2>
  ${programs.length
    ? html`<ul>${programs.map((p) => html`<li><a href="/programme/${p.slug}">${p.party}: ${p.title}</a></li>`)}</ul>`
    : html`<p>Noch keine Dokumente.</p>`}
  </article>`;
  return layout(view, { title: 'Über das Projekt', body, canonical: '/ueber' });
}

export function imprintPage(view) {
  const { imprint } = view.config;
  const body = html`<article class="prose">
  <h1>Impressum</h1>
  ${imprint.name
    ? html`<p>Angaben gemäß § 5 DDG:</p>
      <p>${imprint.name}<br>${raw(escapeHtml(imprint.address).replace(/\s*\|\s*|\n/g, '<br>'))}</p>
      ${imprint.email ? html`<p>E-Mail: <a href="mailto:${imprint.email}">${imprint.email}</a></p>` : ''}
      <p>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: ${imprint.name}</p>`
    : html`<div class="notice error">Das Impressum ist noch nicht ausgefüllt. Betreiber: bitte IMPRINT_NAME, IMPRINT_ADDRESS und IMPRINT_EMAIL setzen.</div>`}
  <h2>Hinweis zu den Inhalten</h2>
  <p>Die Artikel werden automatisiert mit KI erstellt und verlinken ihre Quellen. Für die Richtigkeit der Einordnungen übernehmen wir keine Gewähr; maßgeblich sind die verlinkten Originaldokumente.</p>
  </article>`;
  return layout(view, { title: 'Impressum', body });
}

export function privacyPage(view) {
  const { config } = view;
  const body = html`<article class="prose">
  <h1>Datenschutzerklärung</h1>
  <p class="notice error">Vorlage – vor dem Livegang von der verantwortlichen Stelle prüfen und ergänzen lassen.</p>
  <h2>Verantwortlich</h2>
  <p>${config.imprint.name || '[Name]'}, ${config.imprint.address || '[Anschrift]'}, ${config.imprint.email || '[E-Mail]'}</p>
  <h2>Welche Daten wir verarbeiten</h2>
  <ul>
    <li><strong>Konto:</strong> E-Mail-Adresse, Anzeigename, Passwort (nur als Hash gespeichert), Zeitpunkt der Registrierung und der E-Mail-Bestätigung. Zweck: Kommentarfunktion und Newsletter (Art. 6 Abs. 1 lit. b DSGVO).</li>
    <li><strong>Kommentare:</strong> Text, Zeitpunkt und dein Anzeigename sind öffentlich sichtbar.</li>
    <li><strong>Newsletter:</strong> Nur mit ausdrücklicher Einwilligung und bestätigter E-Mail-Adresse (Double-Opt-in, Art. 6 Abs. 1 lit. a DSGVO). Abbestellen jederzeit über den Link in jeder E-Mail oder im Konto.</li>
    <li><strong>Sitzungs-Cookie:</strong> Ein technisch notwendiges Cookie hält dich angemeldet. Es gibt keine Tracking- oder Werbe-Cookies und keine Analyse-Tools.</li>
    <li><strong>Server-Logs:</strong> Der Hoster verarbeitet beim Aufruf technisch notwendige Verbindungsdaten.</li>
  </ul>
  <h2>Dienstleister</h2>
  <ul>
    <li><strong>Hosting und Datenbank:</strong> Railway Corporation (USA).</li>
    <li><strong>E-Mail-Versand:</strong> Resend (USA) – erhält deine E-Mail-Adresse zum Versand.</li>
    <li><strong>KI-Analyse:</strong> Anthropic (USA) – erhält ausschließlich öffentliche Dokumente (Bundestagsdokumente, Wahlprogramme), keine Nutzerdaten.</li>
  </ul>
  <h2>Deine Rechte</h2>
  <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie auf Beschwerde bei einer Aufsichtsbehörde. Dein Konto samt Kommentaren kannst du jederzeit selbst unter <a href="/konto">Konto</a> löschen.</p>
  </article>`;
  return layout(view, { title: 'Datenschutz', body });
}

export function errorPage(view, status, message) {
  const titles = { 400: 'Ungültige Anfrage', 403: 'Nicht erlaubt', 404: 'Seite nicht gefunden', 413: 'Zu groß', 429: 'Zu viele Anfragen', 500: 'Fehler' };
  const body = html`<section class="empty"><h1>${titles[status] || 'Fehler'}</h1><p>${message || 'Diese Seite gibt es nicht.'}</p><p><a href="/">Zur Startseite</a></p></section>`;
  return layout(view, { title: titles[status] || 'Fehler', body, noindex: true });
}

export function rssFeed(config, articles) {
  const x = (s) => escapeHtml(s);
  const items = articles
    .map(
      (a) => `<item><title>${x(a.title)}</title><link>${x(`${config.baseUrl}/artikel/${a.slug}`)}</link><guid>${x(`${config.baseUrl}/artikel/${a.slug}`)}</guid><pubDate>${new Date(a.published_at).toUTCString()}</pubDate><description>${x(a.lede)}</description></item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${x(config.siteName)}</title><link>${x(config.baseUrl)}</link><description>Was der Bundestag beschließt – und was die Parteien versprochen haben.</description><language>de</language>${items}</channel></rss>`;
}
