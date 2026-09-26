import { escapeHtml, html, paragraphs, raw } from '../html.js';
import { THEMES } from '../mitmachen.js';
import { bySeat, KINDS, partyClass } from '../programs.js';
import { isExternal, LEVELS, RESOURCES } from '../resources.js';
import { formatDateDe, formatDateTimeDe, truncate } from '../text.js';
import { ALIGNMENT_LABEL, ALIGNMENT_SHORT, cls, RESULT_LABEL, shortParty, VOTE_LABEL } from './labels.js';
import { DEFAULT_DESCRIPTION, layout, notices, organization, TAGLINE } from './layout.js';
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

// The landing page: a scroll through the plenary hall. It starts high above
// the seats and ends at the lectern, looking at the members – the reader's
// place. static/landing.js draws the hall; without it the steps are plain
// text on paper, and nothing is lost.
const FAQ = [
  ['Was ist das hier?', (n) => `${n} vergleicht nach jedem Sitzungstag die Beschlüsse des Deutschen Bundestags mit den Wahlprogrammen der Parteien und dem Koalitionsvertrag. Für jeden Beschluss steht dort, was die Parteien versprochen haben, wie ihre Fraktionen abgestimmt haben und ob das zusammenpasst – mit wörtlichen Zitaten und Seitenangabe.`],
  ['Woher kommen die Daten?', () => 'Die Beschlüsse stammen aus der offiziellen Parlamentsdokumentation DIP des Bundestags, das Abstimmungsverhalten aus dem Plenarprotokoll. Die Wahlprogramme laden wir direkt von den Websites der Parteien.'],
  ['Wer entscheidet, ob ein Beschluss zum Programm passt?', () => 'Eine KI (Claude von Anthropic) ordnet ein – aber nur auf Grundlage der gelieferten Dokumente, und jedes Zitat wird vor der Veröffentlichung automatisch Zeichen für Zeichen mit dem Programmtext abgeglichen. Einordnungen ohne überprüfbare Fundstelle werden zurückgezogen. Jede Fundstelle ist verlinkt, damit du selbst nachlesen kannst.'],
  ['Ist die Seite parteiisch?', () => 'Nein. Wir empfehlen keine Partei, alle Programme werden gleich behandelt, und die Parteien stehen in der Sitzordnung des Bundestags. Die Gestaltung verzichtet bewusst auf Farben, die eine Partei für sich beansprucht.'],
  ['Wann erscheint ein neuer Artikel?', () => 'Am Morgen nach jedem Sitzungstag. Trägt der Bundestag später weitere Beschlüsse oder das Plenarprotokoll nach, wird der Artikel aktualisiert.'],
  ['Was kostet das?', () => 'Nichts. Lesen, Kommentieren und der Newsletter sind kostenlos.'],
];

// The 21st Bundestag, left to right as seen from the President.
export const PLENUM = [
  { party: 'Die Linke', short: 'Linke', seats: 64 },
  { party: 'Bündnis 90/Die Grünen', short: 'Grüne', seats: 85 },
  { party: 'SPD', short: 'SPD', seats: 120 },
  { party: 'CDU/CSU', short: 'CDU/CSU', seats: 208 },
  { party: 'AfD', short: 'AfD', seats: 152 },
];

function plenumFallback() {
  // A tiny server-drawn hemicycle for the first paint and for readers
  // without JavaScript; the canvas replaces it.
  const total = PLENUM.reduce((n, p) => n + p.seats, 0);
  let acc = 0;
  const arcs = PLENUM.map((p) => {
    const a0 = Math.PI * (1 - acc / total);
    acc += p.seats;
    const a1 = Math.PI * (1 - acc / total) + 0.02;
    const pt = (r, a) => `${(200 + r * Math.cos(a)).toFixed(1)} ${(200 - r * Math.sin(a)).toFixed(1)}`;
    return `<path d="M${pt(80, a0 - 0.01)} L${pt(180, a0 - 0.01)} A180 180 0 0 1 ${pt(180, a1)} L${pt(80, a1)} A80 80 0 0 0 ${pt(80, a0 - 0.01)}Z"/>`;
  }).join('');
  return raw(`<svg class="plenum-fallback" viewBox="0 0 400 215" aria-hidden="true">${arcs}<circle cx="200" cy="205" r="7"/></svg>`);
}

export function homePage(view, { latest, articles, programCount, preparing = [], lastSyncAt = null }) {
  const { config } = view;
  const rest = latest ? articles.filter((a) => a.id !== latest.id) : articles;
  const latestLink = latest ? `/artikel/${latest.slug}` : '/archiv';
  const body = html`
  <section class="plenum" id="plenum" aria-label="So funktioniert ${config.siteName}">
    <div class="plenum-stage" aria-hidden="true">
      ${plenumFallback()}
      <canvas class="plenum-canvas" data-plenum="${JSON.stringify(PLENUM.map(({ short, seats: n }) => ({ short, seats: n })))}"></canvas>
    </div>
    <div class="plenum-steps">
      <section class="step step-hero" data-step="0">
        <div class="step-card">
          <p class="eyebrow">Der Bundestag, Sitzungstag für Sitzungstag</p>
          <h1><span class="brand-word">${config.siteName}</span> <span class="claim">${TAGLINE}</span></h1>
          <p class="lede">Nach jeder Sitzung legen wir die Beschlüsse des Bundestags ruhig neben die Wahlprogramme der Parteien – mit wörtlichen Zitaten, Fundstellen und dem Abstimmungsverhalten. Überparteilich und ohne Aufregung.</p>
          <p class="hero-actions">
            ${latest ? html`<a class="button" href="${latestLink}">Neuester Sitzungstag: ${formatDateDe(latest.sitting_date, { weekday: false })}</a>` : ''}
            <a class="button ghost" href="#schritt-1">So funktioniert’s ↓</a>
          </p>
        </div>
        <p class="scroll-hint" aria-hidden="true">Scrollen, um in den Plenarsaal zu gehen</p>
      </section>
      <section class="step" id="schritt-1" data-step="1">
        <div class="step-card">
          <p class="step-no">1</p>
          <h2>630 Sitze, fünf Fraktionen</h2>
          <p>So sieht der Plenarsaal von oben aus. Von links nach rechts sitzen die Fraktionen Linke, Grüne, SPD, CDU/CSU und AfD, dazu ein Abgeordneter des SSW. In genau dieser Reihenfolge zeigen wir die Parteien überall auf der Seite – es ist die Ordnung des Parlaments, nicht unsere.</p>
        </div>
      </section>
      <section class="step" data-step="2">
        <div class="step-card">
          <p class="step-no">2</p>
          <h2>Vor der Wahl: versprochen</h2>
          <p>Jede Partei hat aufgeschrieben, was sie vorhat – oft auf mehr als hundert Seiten. Dazu kommt der Koalitionsvertrag. Alle liegen Seite für Seite in unserer öffentlichen <a href="/programme">Bibliothek</a>, durchsuchbar für alle.</p>
        </div>
      </section>
      <section class="step" data-step="3">
        <div class="step-card">
          <p class="step-no">3</p>
          <h2>Im Plenum: beschlossen</h2>
          <p>An jedem Sitzungstag stimmt der Bundestag ab – über Gesetze, Anträge und Beschlussempfehlungen. Wir lesen die offizielle Parlamentsdokumentation und das Plenarprotokoll: was beschlossen wurde und wie jede Fraktion gestimmt hat.</p>
        </div>
      </section>
      <section class="step" data-step="4">
        <div class="step-card">
          <p class="step-no">4</p>
          <h2>Beides nebeneinander</h2>
          <p>Am Morgen danach legen wir jeden Beschluss neben jedes Programm. Zwei Kreise zeigen das Ergebnis – links versprochen, rechts beschlossen:</p>
          ${legend()}
          <p>Jedes Zitat wird vor der Veröffentlichung Zeichen für Zeichen mit dem Programm abgeglichen und ist bis auf die PDF-Seite verlinkt.</p>
        </div>
      </section>
      <section class="step step-final" data-step="5">
        <div class="step-card">
          <p class="step-no">5</p>
          <h2>Jetzt hast du das Wort.</h2>
          <p>Du stehst am Rednerpult. Zu jedem Beschluss zeigen wir kleine Schritte, mit denen du selbst etwas bewegen kannst – im Alltag, mit anderen und in der Politik. Ganz gleich, wen du wählst.</p>
          <p class="hero-actions">
            <a class="button" href="${latestLink}">${latest ? 'Neuesten Sitzungstag lesen' : 'Zu den Sitzungstagen'}</a>
            ${view.user ? html`<a class="button ghost" href="/mitmachen">Mitmachen</a>` : html`<a class="button ghost" href="/registrieren">Newsletter abonnieren</a>`}
          </p>
        </div>
      </section>
    </div>
  </section>

  <div class="wrap landing-after">
  ${latest
    ? html`${feature(latest)}${preparing.length ? preparingNote({ preparing, lastSyncAt, programCount }) : ''}`
    : html`<section class="empty">${venn('teilweise', { size: 'lg' })}
      <h2>Noch kein Sitzungstag</h2>
      <p>Die Parlamentsdokumentation trägt die Beschlüsse meist ein bis zwei Tage nach einer Sitzung ein. Sobald sie da sind, erscheint hier automatisch der Artikel.</p>
      ${preparingNote({ preparing, lastSyncAt, programCount })}
    </section>`}
  ${rest.length
    ? html`<h2 class="section-title">Frühere Sitzungstage</h2>${rest.map(listItem)}<p class="meta"><a href="/archiv">Alle Sitzungstage im Archiv →</a></p>`
    : ''}
  <h2 class="section-title">Selbst etwas bewegen</h2>
  ${themeCards()}
  <section class="faq" aria-labelledby="faq-title">
    <h2 class="section-title" id="faq-title">Häufige Fragen</h2>
    ${FAQ.map(([q, a]) => html`<details><summary>${q}</summary><p>${a(config.siteName)}</p></details>`)}
  </section>
  </div>`;
  return layout(view, {
    title: '',
    description: DEFAULT_DESCRIPTION,
    body,
    canonical: '/',
    bodyClass: 'landing',
    scripts: ['landing'],
    structured: [
      {
        '@context': 'https://schema.org',
        '@graph': [
          organization(config),
          {
            '@type': 'WebSite',
            '@id': `${config.baseUrl}/#website`,
            name: config.siteName,
            alternateName: TAGLINE,
            url: `${config.baseUrl}/`,
            inLanguage: 'de-DE',
            publisher: { '@id': `${config.baseUrl}/#organisation` },
            potentialAction: {
              '@type': 'SearchAction',
              target: { '@type': 'EntryPoint', urlTemplate: `${config.baseUrl}/programme?q={search_term_string}` },
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@type': 'FAQPage',
            mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a(config.siteName) } })),
          },
        ],
      },
    ],
  });
}

export function archivePage(view, { articles }) {
  const byMonth = new Map();
  for (const a of articles) {
    const month = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${a.sitting_date}T12:00:00Z`));
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(a);
  }
  const body = html`<div class="narrow"><h1>Alle Sitzungstage</h1>
  <p class="lede">Jeder Sitzungstag des Bundestags seit Start dieser Seite: die Beschlüsse, das Abstimmungsverhalten der Fraktionen und der Abgleich mit den Wahlprogrammen.</p>
  ${articles.length
    ? [...byMonth.entries()].map(([month, list]) => html`<h2 class="section-title">${month}</h2>${list.map(listItem)}`)
    : html`<p>Noch keine Artikel.</p>`}</div>`;
  return layout(view, {
    title: 'Alle Sitzungstage des Bundestags',
    description: 'Archiv aller Sitzungstage: Beschlüsse des Bundestags, Abstimmungsverhalten der Fraktionen und der Abgleich mit den Wahlprogrammen – Tag für Tag.',
    body,
    canonical: '/archiv',
  });
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
  // Stored articles keep the order they were written in; show them in seat
  // order whatever that was.
  const decisions = (b.decisions || []).map((d) => ({ ...d, parties: [...(d.parties || [])].sort(bySeat) }));
  const programs = [...(b.programs || [])].sort(bySeat);
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
  const { config } = view;
  const url = `${config.baseUrl}/artikel/${article.slug}`;
  const published = new Date(article.published_at).toISOString();
  const modified = new Date(Math.max(new Date(article.created_at), new Date(article.published_at))).toISOString();
  const day = formatDateDe(article.sitting_date, { weekday: false });
  return layout(view, {
    // The date belongs in the title: people search for "Bundestag 25. September".
    title: `${article.title} – Bundestag am ${day}`,
    description: truncate(article.lede, 200),
    body,
    canonical: `/artikel/${article.slug}`,
    ogType: 'article',
    published,
    modified,
    structured: [
      {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'NewsArticle',
            '@id': `${url}#artikel`,
            headline: truncate(article.title, 110),
            description: article.lede,
            datePublished: published,
            dateModified: modified,
            inLanguage: 'de-DE',
            mainEntityOfPage: url,
            url,
            image: [`${config.baseUrl}/static/og.png`],
            articleSection: 'Bundestag',
            keywords: ['Bundestag', 'Wahlprogramm', 'Abstimmung', ...decisions.map((d) => d.headline)].join(', '),
            about: decisions.map((d) => ({ '@type': 'Thing', name: d.title })),
            author: { '@id': `${config.baseUrl}/#organisation` },
            publisher: { '@id': `${config.baseUrl}/#organisation` },
            isAccessibleForFree: true,
            commentCount: data.comments.length,
          },
          organization(config),
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Start', item: `${config.baseUrl}/` },
              { '@type': 'ListItem', position: 2, name: 'Sitzungstage', item: `${config.baseUrl}/archiv` },
              { '@type': 'ListItem', position: 3, name: `Sitzung vom ${day}`, item: url },
            ],
          },
        ],
      },
    ],
  });
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
  <p>Wir empfehlen keine Partei und bewerten keine. Alle Programme werden gleich behandelt und so sortiert, wie die Fraktionen im Plenarsaal sitzen – von links nach rechts aus Sicht des Präsidiums, der Koalitionsvertrag zuletzt. Die Seite selbst verwendet keine Farbe, die eine Partei für sich beansprucht: Parteifarben erscheinen nur als kleiner Punkt zur Orientierung, für alle gleich groß.</p>
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
  return layout(view, {
    title: 'Über uns und Methode',
    description: 'Wie wir Beschlüsse des Bundestags mit Wahlprogrammen abgleichen: Datenquellen, KI-Einordnung, Zitatprüfung und Grenzen der Methode.',
    body,
    canonical: '/ueber',
  });
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
  return layout(view, { title: 'Impressum', body, noindex: true });
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
    <li><strong>Sitzungs-Cookie:</strong> Ein technisch notwendiges Cookie hält dich angemeldet. Es gibt keine Tracking- oder Werbe-Cookies.</li>
    <li><strong>Besucherstatistik:</strong> Um zu sehen, wie viele Menschen die Seite nutzen, zählt unser Server die aufgerufenen Seiten: Adresse der Seite, die verweisende Website (nur der Domainname), eine grobe Geräteklasse (Desktop, Mobil, Tablet) und ggf. ein Kampagnen-Kürzel aus dem Link (utm_source). Um Besuche zu unterscheiden, bilden wir aus IP-Adresse und Browserkennung zusammen mit einem zufälligen Wert, der jeden Tag neu erzeugt und danach gelöscht wird, eine Prüfsumme. IP-Adresse und Browserkennung selbst speichern wir nicht; eine Wiedererkennung über Tage hinweg ist nicht möglich. Es wird nichts auf deinem Gerät gespeichert. Rechtsgrundlage ist unser berechtigtes Interesse an einer bedarfsgerechten Gestaltung des Angebots (Art. 6 Abs. 1 lit. f DSGVO). Die Daten werden nach spätestens 400 Tagen gelöscht.</li>
    ${config.plausible.domain ? html`<li><strong>Plausible Analytics:</strong> Zusätzlich nutzen wir Plausible (Plausible Insights OÜ, Estland, Server in der EU), ebenfalls ohne Cookies und ohne Speicherung personenbezogener Daten auf deinem Gerät.</li>` : ''}
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
