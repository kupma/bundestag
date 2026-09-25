import { escapeHtml, html, paragraphs, raw } from '../html.js';
import { THEMES } from '../mitmachen.js';
import { KINDS, partyClass } from '../programs.js';
import { isExternal, LEVELS, RESOURCES } from '../resources.js';
import { formatDateDe, formatDateTimeDe, truncate } from '../text.js';
import { ALIGNMENT_LABEL, ALIGNMENT_SHORT, cls, RESULT_LABEL, shortParty, VOTE_LABEL } from './labels.js';
import { layout, notices } from './layout.js';
import { themeIcon, venn } from './shapes.js';

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

function resourceLink(key) {
  const r = RESOURCES[key];
  if (!r) return '';
  return isExternal(r.url)
    ? html`<a href="${r.url}" target="_blank" rel="noopener">${r.label} ↗</a>`
    : html`<a href="${r.url}">${r.label} →</a>`;
}

function verdictCounts(decisions) {
  const counts = { entspricht: 0, teilweise: 0, widerspricht: 0, nicht_thematisiert: 0 };
  for (const d of decisions || []) for (const p of d.parties || []) if (p.alignment in counts) counts[p.alignment]++;
  return counts;
}

export function legend() {
  return html`<p class="legend" aria-label="Legende">
    ${['entspricht', 'teilweise', 'widerspricht', 'nicht_thematisiert'].map((a) => html`<span>${venn(a)} ${ALIGNMENT_SHORT[a]}</span>`)}
  </p>`;
}

// --- home ----------------------------------------------------------------------------

function feature(a) {
  const decisions = (a.body && a.body.decisions) || [];
  const counts = verdictCounts(decisions);
  return html`<article class="card feature">
    <p class="eyebrow">Neuester Sitzungstag · ${formatDateDe(a.sitting_date)}</p>
    <h2><a href="/artikel/${a.slug}">${a.title}</a></h2>
    <p class="lede">${a.lede}</p>
    ${decisions.length
      ? html`<p class="glance-mini">${Object.entries(counts)
          .filter(([, n]) => n)
          .map(([k, n]) => html`<span>${venn(k)} ${n}× ${ALIGNMENT_SHORT[k]}</span>`)}</p>`
      : ''}
    <p class="meta">${plural(decisions.length, 'Beschluss', 'Beschlüsse')} im Abgleich · ${plural(a.comment_count || 0, 'Kommentar', 'Kommentare')} · <a href="/artikel/${a.slug}">Weiterlesen</a></p>
  </article>`;
}

function listItem(a) {
  return html`<article class="list-item">
    <p class="list-date">${formatDateDe(a.sitting_date)}</p>
    <div>
      <h3><a href="/artikel/${a.slug}">${a.title}</a></h3>
      <p>${truncate(a.lede, 220)}</p>
      <p class="meta">${plural(a.decision_count || 0, 'Beschluss', 'Beschlüsse')} · ${plural(a.comment_count || 0, 'Kommentar', 'Kommentare')}</p>
    </div>
  </article>`;
}

export function themeCards() {
  return html`<div class="themes">${THEMES.map(
    (t) => html`<a class="theme-card" href="/mitmachen#${t.id}">${themeIcon(t.id)}<h3>${t.title}</h3><p>${t.teaser}</p></a>`,
  )}</div>`;
}

function preparingNote({ preparing = [], lastSyncAt = null, programCount }) {
  if (preparing.length) {
    return html`<p class="notice"><span><strong>In Vorbereitung:</strong> ${preparing.map((d, i) => html`${i ? ' · ' : ''}Sitzung vom ${formatDateDe(d)}`)}. Der Artikel erscheint automatisch, sobald die Beschlüsse vollständig dokumentiert sind.</span></p>`;
  }
  if (!programCount) return html`<p class="meta">Die Wahlprogramme werden gerade in die Bibliothek geladen.</p>`;
  return lastSyncAt ? html`<p class="meta">Zuletzt beim Bundestag nachgesehen: ${formatDateTimeDe(lastSyncAt)}.</p>` : '';
}

export function homePage(view, { latest, articles, programCount, preparing = [], lastSyncAt = null }) {
  const rest = latest ? articles.filter((a) => a.id !== latest.id) : articles;
  const body = html`
  ${!view.user
    ? html`<section class="hero">
      <h1>Was versprochen war. Was beschlossen wurde.</h1>
      <p class="lede">Nach jedem Sitzungstag des Bundestags legen wir die Beschlüsse ruhig neben die Wahlprogramme – mit Fundstellen, ohne Aufregung. Und wir zeigen, was du selbst beitragen kannst.</p>
      <p class="hero-actions"><a class="button" href="/registrieren">Kostenlos registrieren</a><a class="button ghost" href="/mitmachen">Mitmachen</a></p>
    </section>`
    : ''}
  ${latest
    ? html`${feature(latest)}${preparing.length ? preparingNote({ preparing, lastSyncAt, programCount }) : ''}`
    : html`<section class="empty">${venn('teilweise', { size: 'lg' })}
      <h2>Noch kein Sitzungstag</h2>
      <p>Die Parlamentsdokumentation trägt die Beschlüsse meist ein bis zwei Tage nach einer Sitzung ein. Sobald sie da sind, erscheint hier automatisch der Artikel.</p>
      ${preparingNote({ preparing, lastSyncAt, programCount })}
    </section>`}
  <h2 class="section-title">Selbst etwas bewegen</h2>
  ${themeCards()}
  ${rest.length
    ? html`<h2 class="section-title">Frühere Sitzungstage</h2>${rest.map(listItem)}<p class="meta"><a href="/archiv">Alle Sitzungstage im Archiv →</a></p>`
    : ''}`;
  return layout(view, {
    title: '',
    description: 'Was der Bundestag beschließt – ruhig abgeglichen mit den Wahlprogrammen der Parteien, mit Fundstellen und Ideen zum Mitmachen.',
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
  const body = html`<div class="narrow"><h1>Archiv</h1>
  ${articles.length
    ? [...byMonth.entries()].map(([month, list]) => html`<h2 class="section-title">${month}</h2>${list.map(listItem)}`)
    : html`<p>Noch keine Artikel.</p>`}</div>`;
  return layout(view, { title: 'Archiv', body, canonical: '/archiv' });
}

// --- article -------------------------------------------------------------------------

function glance(decisions, programs) {
  if (!decisions.length || !programs.length) return '';
  return html`<section class="card glance" aria-labelledby="glance-title">
    <h2 id="glance-title">Auf einen Blick</h2>
    <table>
      <thead><tr><th scope="col">Beschluss</th>${programs.map(
        (p) => html`<th scope="col" class="${partyClass(p.party)}" title="${p.party} – ${KINDS[p.kind] || ''}"><span class="dot" aria-hidden="true"></span>${shortParty(p.party, p.kind)}</th>`,
      )}</tr></thead>
      <tbody>${decisions.map(
        (d, i) => html`<tr>
          <td><a href="#beschluss-${i + 1}">${d.headline}</a> <span class="result result-${cls(d.result)}">${RESULT_LABEL[d.result] || d.result}</span></td>
          ${programs.map((prog) => {
            const p = d.parties.find((x) => x.programId === prog.id);
            const a = p ? p.alignment : 'nicht_thematisiert';
            return html`<td>${venn(a, { label: `${prog.party}: ${ALIGNMENT_LABEL[a]}` })}</td>`;
          })}
        </tr>`,
      )}</tbody>
    </table>
    ${legend()}
  </section>`;
}

function partyRow(p) {
  const vote = VOTE_LABEL[p.vote];
  return html`<li class="party-row align-${cls(p.alignment)} ${partyClass(p.party)}">
    ${venn(p.alignment, { label: ALIGNMENT_LABEL[p.alignment] })}
    <div>
      <div class="party-head">
        <span class="party-name"><span class="dot" aria-hidden="true"></span>${p.party}</span>
        <span class="party-kind">${KINDS[p.kind] || ''}</span>
        <span class="verdict">${ALIGNMENT_LABEL[p.alignment] || p.alignment}</span>
        ${vote ? html`<span class="vote">${vote}</span>` : ''}
      </div>
      <p class="party-row-text">${p.assessment}</p>
      ${p.citations.length
        ? html`<ul class="citations">${p.citations.map(
            (c) => html`<li>
              ${c.quote ? html`<blockquote>„${c.quote}“</blockquote>` : ''}
              <span class="cite-links"><a href="/stelle/${c.chunkId}">${KINDS[p.kind] || 'Dokument'} ${p.party}, PDF-Seite ${c.page}</a>${
                c.url ? html` · <a href="${c.url}" target="_blank" rel="noopener">Original ↗</a>` : ''
              }</span>
            </li>`,
          )}</ul>`
        : ''}
    </div>
  </li>`;
}

function todo(actions) {
  if (!actions || !actions.length) return '';
  return html`<section class="panel todo">
    <h3>Was du tun kannst</h3>
    <ul>${actions.map(
      (a) => html`<li><span class="pill">${LEVELS[a.level] || a.level}</span><p>${a.text}</p>${a.resource ? resourceLink(a.resource) : ''}</li>`,
    )}</ul>
  </section>`;
}

function decisionSection(d, i) {
  return html`<section class="decision" id="beschluss-${i + 1}">
    <h2>${d.headline}</h2>
    <div class="decision-meta">
      <span class="result result-${cls(d.result)}">${RESULT_LABEL[d.result] || d.result}</span>
      ${d.vorgangstyp ? html`<span>${d.vorgangstyp}</span>` : ''}
      <span class="official-title">${d.title}</span>
    </div>
    <p>${d.summary}</p>
    ${d.votesNote ? html`<p class="votes"><strong>Abstimmung</strong><span>${d.votesNote}</span></p>` : ''}
    <h3>Was in den Programmen steht</h3>
    <ul class="compare">${d.parties.map(partyRow)}</ul>
    ${todo(d.actions)}
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
    form = html`<p class="login-hint">Bitte bestätige zuerst deine E-Mail-Adresse, dann kannst du mitdiskutieren. <a href="/konto">Bestätigungslink erneut senden</a></p>`;
  } else {
    form = html`<form method="post" action="/artikel/${article.slug}/kommentare" class="comment-form">
      ${notices({ error: commentError })}
      <label for="comment-body">Dein Kommentar <span class="meta">(als ${user.display_name})</span></label>
      <textarea id="comment-body" name="body" rows="4" maxlength="4000" required>${commentDraft || ''}</textarea>
      <button type="submit">Kommentar veröffentlichen</button>
    </form>`;
  }
  return html`<section class="comments" id="kommentare">
    <h2>Diskussion</h2>
    <p class="house-rules">Hart in der Sache, freundlich im Ton. Wir freuen uns über Widerspruch und Ergänzungen; Beleidigungen, Hetze und Werbung löschen wir.</p>
    ${comments.length
      ? html`<ol class="comment-list">${comments.map(
          (c) => html`<li class="comment" id="kommentar-${c.id}">
            <p class="comment-meta"><span class="avatar" aria-hidden="true">${String(c.display_name).trim().charAt(0).toUpperCase()}</span><strong>${c.display_name}</strong><time datetime="${new Date(c.created_at).toISOString()}">${formatDateTimeDe(c.created_at)}</time></p>
            ${paragraphs(c.body)}
            ${user && (user.id === c.user_id || user.is_admin)
              ? html`<form method="post" action="/kommentare/${c.id}/loeschen" class="inline"><button class="link danger" type="submit">Löschen</button></form>`
              : ''}
          </li>`,
        )}</ol>`
      : html`<p class="meta">Noch keine Kommentare – schreib gern den ersten.</p>`}
    ${form}
  </section>`;
}

export function articlePage(view, data) {
  const { article } = data;
  const b = article.body || {};
  const decisions = b.decisions || [];
  const programs = b.programs || [];
  const body = html`<article>
    <header class="article-head">
      <p class="eyebrow">Sitzung des Bundestags vom ${formatDateDe(article.sitting_date)}</p>
      <h1>${article.title}</h1>
      <p class="lede">${article.lede}</p>
      <p class="meta">${plural(decisions.length, 'Beschluss', 'Beschlüsse')} im Abgleich mit ${plural(programs.length, 'Programm', 'Programmen')}${
        new Date(article.created_at) - new Date(article.published_at) > 30 * 60 * 1000 ? html` · aktualisiert ${formatDateTimeDe(article.created_at)}` : ''
      } · <a href="#kommentare">${plural(data.comments.length, 'Kommentar', 'Kommentare')}</a> · <a href="/ueber#methode">So entsteht dieser Artikel</a></p>
    </header>
    ${article.status === 'hidden' ? html`<div class="notice error"><div>Dieser Artikel ist ausgeblendet und nur für Admins sichtbar.</div></div>` : ''}
    <div class="article-body">
      <div class="intro">${(b.intro || []).map((p) => html`<p>${p}</p>`)}</div>
      ${b.commonGround
        ? html`<aside class="panel common-ground">${venn('entspricht')}<div><h2>Gemeinsamkeiten</h2><p>${b.commonGround}</p></div></aside>`
        : ''}
    </div>
    ${glance(decisions, programs)}
    <div class="article-body">
      ${decisions.map(decisionSection)}
      ${(b.others || []).length
        ? html`<section class="others"><h2>Weitere Beschlüsse des Tages</h2><ul>${b.others.map(
            (o) => html`<li>${o.title} <span class="meta">– ${o.tenor || RESULT_LABEL[o.outcome] || o.outcome}</span></li>`,
          )}</ul></section>`
        : ''}
      <aside class="panel disclaimer">
        <p><strong>So entsteht dieser Artikel.</strong> Die Beschlüsse stammen aus der Parlamentsdokumentation (DIP) des Bundestags, das Abstimmungsverhalten aus dem Plenarprotokoll. Die Einordnung schreibt eine KI (Claude von Anthropic) nur auf Grundlage dieser Dokumente und der verlinkten Programmstellen. Jedes Zitat wird vor der Veröffentlichung automatisch mit dem Programmtext abgeglichen; Einordnungen ohne überprüfbare Fundstelle werden zurückgezogen. Fehler sind trotzdem möglich – deshalb ist jede Fundstelle verlinkt. <a href="/ueber#methode">Mehr zur Methode</a></p>
      </aside>
    </div>
  </article>
  ${commentsSection(view, data)}`;
  return layout(view, { title: article.title, description: truncate(article.lede, 200), body, canonical: `/artikel/${article.slug}` });
}

// --- mitmachen -----------------------------------------------------------------------

export function mitmachenPage(view) {
  const body = html`<div class="narrow">
    <h1>Mitmachen</h1>
    <p class="lede">Veränderung fängt klein an, und sie muss nicht anstrengend sein. Hier sammeln wir Wege, wie du im Alltag, mit anderen und in der Politik etwas Gutes bewirken kannst – ganz gleich, wen du wählst.</p>
    <nav class="theme-nav" aria-label="Themen">${THEMES.map((t) => html`<a href="#${t.id}">${t.title}</a>`)}</nav>
  </div>
  ${THEMES.map(
    (t) => html`<section class="theme" id="${t.id}">
      <div class="theme-head">${themeIcon(t.id)}<h2>${t.title}</h2></div>
      <p class="lede">${t.intro}</p>
      <div class="tips">${t.tips.map(
        (tip) => html`<article class="tip">
          <p class="pills">${tip.levels.map((l) => html`<span class="pill">${LEVELS[l]}</span>`)}</p>
          <h3>${tip.title}</h3>
          <p>${tip.text}</p>
          ${tip.links && tip.links.length ? html`<p class="tip-links">${tip.links.map((k, i) => html`${i ? ' · ' : ''}${resourceLink(k)}`)}</p>` : ''}
        </article>`,
      )}</div>
    </section>`,
  )}
  <p class="meta narrow">Du kennst einen guten Weg, der hier fehlt? Schreib ihn unter einen Artikel – wir ergänzen die Sammlung.</p>`;
  return layout(view, {
    title: 'Mitmachen',
    description: 'Kleine, praktische Wege, etwas Gutes zu bewirken: beim Einkaufen, in der Demokratie, im Miteinander – überparteilich.',
    body,
    canonical: '/mitmachen',
  });
}

// --- about, legal, errors --------------------------------------------------------------

export function aboutPage(view, { programs }) {
  const body = html`<article class="prose">
  <h1>Über uns</h1>
  <p class="lede">Vor der Wahl schreiben Parteien auf, was sie vorhaben. Danach entscheidet der Bundestag. ${view.config.siteName} legt beides ruhig nebeneinander – und zeigt, was jede und jeder selbst beitragen kann.</p>
  <h2>Überparteilich</h2>
  <p>Wir empfehlen keine Partei und bewerten keine. Alle Programme werden gleich behandelt und alphabetisch sortiert. Die Seite selbst verwendet keine Farbe, die eine Partei für sich beansprucht: Parteifarben erscheinen nur als kleiner Punkt zur Orientierung, für alle gleich groß.</p>
  <h2>Die zwei Kreise</h2>
  <p>Der linke Kreis steht für das, was versprochen wurde, der rechte für das, was beschlossen wurde. Wie sie sich überlagern, ist die Einordnung:</p>
  ${legend()}
  <p>Die Einordnung sagt, wie ein Beschluss zu einem Programm steht – nicht, ob er gut oder schlecht ist. Das darfst du selbst entscheiden.</p>
  <h2 id="methode">Methode</h2>
  <ol>
    <li><strong>Beschlüsse:</strong> Wir lesen die Parlamentsdokumentation <a href="https://dip.bundestag.de">DIP</a> des Bundestags aus. Als Beschluss zählt jede Abstimmung im Plenum über eine Vorlage – Überweisungen an Ausschüsse zählen nicht. Gesetze und namentliche Abstimmungen kommen zuerst; Petitionen und Wahlen stehen am Ende unter „Weitere Beschlüsse“.</li>
    <li><strong>Abstimmungsverhalten:</strong> Wie die Fraktionen gestimmt haben, steht im Plenarprotokoll. Wir suchen dort die Abstimmungsformel zum jeweiligen Beschluss („mit den Stimmen der … gegen die Stimmen der …“). Liegt das Protokoll noch nicht vor, steht „Abstimmung unbekannt“.</li>
    <li><strong>Bibliothek:</strong> Die Wahlprogramme liegen als PDF vor. Wir zerlegen sie in kurze Passagen, von denen jede genau eine Seite hat, und machen sie durchsuchbar. Die <a href="/programme">Bibliothek</a> ist öffentlich.</li>
    <li><strong>Einordnung:</strong> Eine KI (Claude von Anthropic) vergleicht jeden Beschluss mit den passendsten Passagen jedes Programms. Sie darf nur die gelieferten Dokumente verwenden und muss wörtlich zitieren.</li>
    <li><strong>Prüfung:</strong> Bevor ein Artikel erscheint, prüft ein Programm jedes Zitat Zeichen für Zeichen gegen den Programmtext. Nicht auffindbare Zitate werden gestrichen; eine Einordnung ohne belegbare Fundstelle wird zurückgezogen.</li>
    <li><strong>Was du tun kannst:</strong> Zu jedem Beschluss schlagen wir kleine Schritte vor – für dich, mit anderen oder in der Politik. Sie sollen unabhängig davon hilfreich sein, wie du zu dem Beschluss stehst. Links führen nur zu einer festen, von uns geprüften Liste von Angeboten.</li>
  </ol>
  <p>Seitenangaben beziehen sich auf die Seite im PDF, nicht auf die gedruckte Seitenzahl.</p>
  <h2>Grenzen</h2>
  <p>Eine KI kann sich irren, eine Suche kann die passende Stelle übersehen, und Programme sind oft allgemeiner formuliert als Gesetze. „Nicht thematisiert“ heißt: In den gefundenen Passagen steht nichts dazu – nicht, dass die Partei keine Meinung hat. Wenn dir ein Fehler auffällt, schreib es gern in die Diskussion.</p>
  <h2>In der Bibliothek</h2>
  ${programs.length
    ? html`<ul>${programs.map((p) => html`<li><a href="/programme/${p.slug}">${p.party}: ${p.title}</a></li>`)}</ul>`
    : html`<p>Noch keine Dokumente.</p>`}
  </article>`;
  return layout(view, { title: 'Über uns', body, canonical: '/ueber' });
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
    : html`<div class="notice error"><div>Das Impressum ist noch nicht ausgefüllt. Betreiber: bitte IMPRINT_NAME, IMPRINT_ADDRESS und IMPRINT_EMAIL setzen.</div></div>`}
  <h2>Hinweis zu den Inhalten</h2>
  <p>Die Artikel werden automatisiert mit KI erstellt und verlinken ihre Quellen. Für die Richtigkeit der Einordnungen übernehmen wir keine Gewähr; maßgeblich sind die verlinkten Originaldokumente.</p>
  </article>`;
  return layout(view, { title: 'Impressum', body });
}

export function privacyPage(view) {
  const { config } = view;
  const body = html`<article class="prose">
  <h1>Datenschutzerklärung</h1>
  <div class="notice error"><div>Vorlage – vor dem Livegang von der verantwortlichen Stelle prüfen und ergänzen lassen.</div></div>
  <h2>Verantwortlich</h2>
  <p>${config.imprint.name || '[Name]'}, ${config.imprint.address || '[Anschrift]'}, ${config.imprint.email || '[E-Mail]'}</p>
  <h2>Welche Daten wir verarbeiten</h2>
  <ul>
    <li><strong>Konto:</strong> E-Mail-Adresse, Anzeigename, Passwort (nur als Hash gespeichert), Zeitpunkt der Registrierung und der E-Mail-Bestätigung. Zweck: Diskussion und Newsletter (Art. 6 Abs. 1 lit. b DSGVO).</li>
    <li><strong>Kommentare:</strong> Text, Zeitpunkt und dein Anzeigename sind öffentlich sichtbar.</li>
    <li><strong>Newsletter:</strong> Nur mit ausdrücklicher Einwilligung und bestätigter E-Mail-Adresse (Double-Opt-in, Art. 6 Abs. 1 lit. a DSGVO). Abbestellen jederzeit über den Link in jeder E-Mail oder im Konto.</li>
    <li><strong>Sitzungs-Cookie:</strong> Ein technisch notwendiges Cookie hält dich angemeldet. Es gibt keine Tracking- oder Werbe-Cookies und keine Analyse-Tools.</li>
    <li><strong>Schriftarten:</strong> Die Schriften werden von unserem eigenen Server geladen; es besteht keine Verbindung zu Google oder anderen Schriftanbietern.</li>
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
  const titles = { 400: 'Das hat nicht geklappt', 403: 'Nicht erlaubt', 404: 'Seite nicht gefunden', 413: 'Zu groß', 429: 'Kurz durchatmen', 500: 'Da ist etwas schiefgegangen' };
  const body = html`<section class="empty">${venn('widerspricht', { size: 'lg' })}<h1>${titles[status] || 'Fehler'}</h1><p>${message || 'Diese Seite gibt es nicht.'}</p><p><a class="button ghost" href="/">Zur Startseite</a></p></section>`;
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
