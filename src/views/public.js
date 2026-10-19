import { escapeHtml, html, paragraphs, raw } from '../html.js';
import { THEMES } from '../mitmachen.js';
import { fraktionOf, partyClass } from '../plenum.js';
import { isExternal, LEVELS, RESOURCES, shownActions } from '../resources.js';
import { formatDateDe, formatDateTimeDe, truncate } from '../text.js';
import { agendaTeaser } from './agenda.js';
import { decisionContext, decisionTags, EXPLAINER_PATH } from './explainer.js';
import { cls, PLENUM, RESULT_LABEL, VOTE_LABEL, VOTE_ORDER } from './labels.js';
import { DEFAULT_DESCRIPTION, layout, notices, organization, shareImage, TAGLINE } from './layout.js';
import { hallMark, themeIcon } from './shapes.js';
import { shareSheet } from './share.js';

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

function resourceLink(key) {
  const r = RESOURCES[key];
  if (!r) return '';
  return isExternal(r.url)
    ? html`<a href="${r.url}" target="_blank" rel="noopener">${r.label} ↗</a>`
    : html`<a href="${r.url}">${r.label} →</a>`;
}

// --- home ----------------------------------------------------------------------------

function feature(a) {
  const decisions = (a.body && a.body.decisions) || [];
  return html`<article class="card feature">
    <p class="eyebrow">Neuester Sitzungstag · ${formatDateDe(a.sitting_date)}</p>
    <h2><a href="/artikel/${a.slug}">${a.title}</a></h2>
    <p class="lede">${a.lede}</p>
    ${decisions.length
      ? html`<ul class="feature-decisions">${decisions.slice(0, 4).map(
          (d) => html`<li><span class="result result-${cls(d.result)}">${RESULT_LABEL[d.result] || d.result}</span> ${d.headline}</li>`,
        )}</ul>`
      : ''}
    <p class="meta">${plural(decisions.length, 'Beschluss', 'Beschlüsse')} erklärt · ${plural(a.comment_count || 0, 'Kommentar', 'Kommentare')} · <a href="/artikel/${a.slug}">Weiterlesen</a></p>
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

function preparingNote({ preparing = [], lastSyncAt = null }) {
  if (preparing.length) {
    return html`<p class="notice"><span><strong>In Vorbereitung:</strong> ${preparing.map((d, i) => html`${i ? ' · ' : ''}Sitzung vom ${formatDateDe(d)}`)}. Der Artikel erscheint automatisch, sobald die Beschlüsse vollständig dokumentiert sind.</span></p>`;
  }
  return lastSyncAt ? html`<p class="meta">Zuletzt beim Bundestag nachgesehen: ${formatDateTimeDe(lastSyncAt)}.</p>` : '';
}

// The landing page: a scroll through the plenary hall. It starts high above
// the seats and ends at the lectern, looking at the members – the reader's
// place. static/landing.js draws the hall; without it the steps are plain
// text on paper, and nothing is lost.
const FAQ = [
  ['Was ist das hier?', (n) => `${n} erklärt nach jedem Sitzungstag, was der Deutsche Bundestag beschlossen hat: was die Beschlüsse bedeuten, wie die Fraktionen abgestimmt haben und wie es weitergeht. Die Vorschau zeigt, worüber als Nächstes abgestimmt wird.`],
  ['Woher kommen die Daten?', () => 'Die Beschlüsse und Drucksachen stammen aus der offiziellen Parlamentsdokumentation DIP des Bundestags, das Abstimmungsverhalten aus dem Plenarprotokoll, die Vorschau aus der Tagesordnung des Bundestags. Jede Quelle ist verlinkt.'],
  ['Wer schreibt die Texte?', () => 'Eine KI (Claude von Anthropic) – aber nur auf Grundlage der gelieferten Dokumente des Bundestags. Sie soll sachlich und ohne Wertung erklären und nichts hinzufügen, was nicht in den Quellen steht. Fehler sind trotzdem möglich; deshalb ist jede Quelle verlinkt.'],
  ['Ist die Seite parteiisch?', () => 'Nein. Wir empfehlen keine Partei und bewerten keinen Beschluss. Die Fraktionen stehen überall in der Sitzordnung des Bundestags, und die Gestaltung verzichtet bewusst auf Farben, die eine Partei für sich beansprucht.'],
  ['Wann erscheint ein neuer Artikel?', () => 'Am Morgen nach jedem Sitzungstag. Trägt der Bundestag später weitere Beschlüsse oder das Plenarprotokoll nach, wird der Artikel aktualisiert.'],
  ['Gilt ein Gesetz, sobald der Bundestag es beschlossen hat?', () => 'Noch nicht. Nach dem Beschluss im Bundestag ist der Bundesrat dran, dann unterschreibt der Bundespräsident, und das Gesetz wird im Bundesgesetzblatt verkündet. Erst dann tritt es in Kraft – an dem Tag, den es selbst nennt. Und ein angenommener Antrag ist gar kein Gesetz, sondern eine Forderung oder Stellungnahme des Bundestags. Mehr dazu auf der Seite „So arbeitet der Bundestag“.'],
  ['Kann ich sehen, worüber als Nächstes abgestimmt wird?', () => 'Ja, in der Vorschau. Dort steht die Tagesordnung der kommenden Sitzungstage, und die Punkte, an deren Ende abgestimmt wird, stehen vorn – Gesetze, Beschlussempfehlungen und Wahlen. Grundlage ist die offizielle Tagesordnung des Bundestags.'],
  ['Was kostet das?', () => 'Nichts. Lesen, Kommentieren und der Newsletter sind kostenlos.'],
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

export function homePage(view, { latest, articles, preparing = [], lastSyncAt = null, upcoming = [] }) {
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
          <p class="lede">Nach jeder Sitzung erklären wir in einfachen Worten, was der Bundestag beschlossen hat, wie die Fraktionen abgestimmt haben und was das bedeutet. Überparteilich und ohne Aufregung.</p>
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
          <p class="step-debate">Die Linien dazwischen sind die Debatte: Jemand spricht, aus einer anderen Fraktion kommt die Antwort, und auf die wird wieder geantwortet – quer durch den Saal. Wähl einen Sitz, und er ergreift das Wort.</p>
        </div>
      </section>
      <section class="step" data-step="2">
        <div class="step-card">
          <p class="step-no">2</p>
          <h2>Vorher: auf der Tagesordnung</h2>
          <p>Was der Bundestag entscheidet, steht vorher auf seiner Tagesordnung – meist in schwer lesbarer Amtssprache. Unsere <a href="/vorschau">Vorschau</a> sagt in wenigen Sätzen, worum es bei den großen Punkten geht und was die Ausschüsse daraus gemacht haben.</p>
        </div>
      </section>
      <section class="step" data-step="3">
        <div class="step-card">
          <p class="step-no">3</p>
          <h2>Im Plenum: beschlossen</h2>
          <p>An jedem Sitzungstag stimmt der Bundestag ab – über Gesetze, Anträge und Beschlussempfehlungen. Wir lesen die offizielle Parlamentsdokumentation und das Plenarprotokoll: was beschlossen wurde und wie jede Fraktion gestimmt hat.</p>
          <p>Was eine Lesung ist und wann ein Gesetz wirklich gilt: <a href="${EXPLAINER_PATH}">So arbeitet der Bundestag</a>.</p>
        </div>
      </section>
      <section class="step" data-step="4">
        <div class="step-card">
          <p class="step-no">4</p>
          <h2>Am Morgen danach: erklärt</h2>
          <p>Für jeden Sitzungstag schreiben wir auf, was beschlossen wurde, wie jede Fraktion abgestimmt hat und was das heißt – zum Beispiel, ob ein Gesetz damit schon gilt. Jede Quelle ist verlinkt.</p>
        </div>
      </section>
      <section class="step step-final" data-step="5">
        <div class="step-card">
          <p class="step-no">5</p>
          <h2>Jetzt hast du das Wort.</h2>
          <p>Du stehst am Rednerpult. Wo ein Beschluss deinen Alltag berührt, zeigen wir, was du konkret daraus machen kannst. Und unter <a href="/mitmachen">Mitmachen</a> steht, wie du dich einbringst – ganz gleich, wen du wählst.</p>
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
    ? html`${feature(latest)}${preparing.length ? preparingNote({ preparing, lastSyncAt }) : ''}`
    : html`<section class="empty">${hallMark()}
      <h2>Noch kein Sitzungstag</h2>
      <p>Die Parlamentsdokumentation trägt die Beschlüsse meist ein bis zwei Tage nach einer Sitzung ein. Sobald sie da sind, erscheint hier automatisch der Artikel.</p>
      ${preparingNote({ preparing, lastSyncAt })}
    </section>`}
  ${agendaTeaser(upcoming)}
  ${rest.length
    ? html`<h2 class="section-title">Frühere Sitzungstage</h2>${rest.map(listItem)}<p class="meta"><a href="/archiv">Alle Sitzungstage im Archiv →</a></p>`
    : ''}
  <h2 class="section-title">Selbst etwas bewegen</h2>
  ${themeCards()}
  <section class="faq" aria-labelledby="faq-title">
    <h2 class="section-title" id="faq-title">Häufige Fragen</h2>
    ${FAQ.map(([q, a]) => html`<details><summary>${q}</summary><p>${a(config.siteName)}</p></details>`)}
    <p class="meta"><a href="${EXPLAINER_PATH}">Wie der Bundestag entscheidet, einfach erklärt →</a></p>
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
  <p class="lede">Jeder Sitzungstag des Bundestags seit Start dieser Seite: die Beschlüsse, was sie bedeuten und wie die Fraktionen abgestimmt haben.</p>
  ${articles.length
    ? [...byMonth.entries()].map(([month, list]) => html`<h2 class="section-title">${month}</h2>${list.map(listItem)}`)
    : html`<p>Noch keine Artikel.</p>`}</div>`;
  return layout(view, {
    title: 'Alle Sitzungstage des Bundestags',
    description: 'Archiv aller Sitzungstage: Beschlüsse des Bundestags verständlich erklärt, mit dem Abstimmungsverhalten der Fraktionen – Tag für Tag.',
    body,
    canonical: '/archiv',
  });
}

// --- article -------------------------------------------------------------------------

// How each group voted. Articles written before the programme comparison
// was dropped kept a vote per programme; those map back onto the groups.
export function votesOf(d) {
  if (Array.isArray(d.votes)) return d.votes;
  const out = PLENUM.map((p) => ({ fraktion: p.short, vote: 'unbekannt' }));
  for (const p of d.parties || []) {
    const slot = out.find((v) => v.fraktion === fraktionOf(p.party));
    if (slot && VOTE_LABEL[p.vote]) slot.vote = p.vote;
  }
  return out;
}

const knownVotes = (votes) => votes.some((v) => v.vote !== 'unbekannt');

// Closed, a decision says in one line who voted how: "Ja: SPD, CDU/CSU ·
// Nein: AfD · Enthaltung: Linke, Grüne".
function votesLine(votes) {
  const groups = VOTE_ORDER.filter((v) => v !== 'unbekannt')
    .map((v) => [v, votes.filter((x) => x.vote === v)])
    .filter(([, list]) => list.length);
  if (!groups.length) return '';
  return html`<span class="decision-votes">${groups.map(([v, list]) => html`<span><strong>${VOTE_LABEL[v]}:</strong> ${list.map((x) => x.fraktion).join(', ')}</span>`)}</span>`;
}

// Open, each group in seat order with its vote – told apart by shape, not
// colour: yes filled, no outlined, abstention dashed.
function votesBox(votes, note) {
  return html`<section class="votes" aria-label="Abstimmung">
    <h3>Abstimmung</h3>
    ${knownVotes(votes)
      ? html`<ul class="vote-list">${votes.map(
          (v) => html`<li class="${partyClass(v.fraktion)}"><span class="dot" aria-hidden="true"></span><span class="vote-fraktion">${v.fraktion}</span> <span class="vote-pill vote-${cls(v.vote)}">${VOTE_LABEL[v.vote] || v.vote}</span></li>`,
        )}</ul>`
      : ''}
    ${note
      ? html`<p class="meta">${note}</p>`
      : knownVotes(votes)
        ? ''
        : html`<p class="meta">Wie die Fraktionen abgestimmt haben, steht im Plenarprotokoll. Liegt es vor, tragen wir es hier nach.</p>`}
  </section>`;
}

function todo(stored) {
  const actions = shownActions(stored);
  if (!actions.length) return '';
  return html`<section class="panel todo">
    <h3>Was du tun kannst</h3>
    <ul>${actions.map(
      (a) => html`<li><span class="pill">${LEVELS[a.level] || a.level}</span><p>${a.text}</p>${a.resource ? resourceLink(a.resource) : ''}</li>`,
    )}</ul>
  </section>`;
}

// A decision has its own address for sharing (see articlePage). The number in
// it is the decision's, not its place in the article, so a link stays right
// when a rewrite adds a decision above it.
const decisionPath = (article, d) => `/artikel/${article.slug}/beschluss/${d.decisionId}`;

const day = (date) => formatDateDe(date, { weekday: false });
const shareText = (headline, date) => `${headline} – Bundestag am ${day(date)}`;

// Each decision is a fold: closed, it is one line with the result and who
// voted how; open, what it means. Native <details>, so it works without
// JavaScript; static/article.js opens the one a link points to. The shared
// one is open from the start.
function decisionSection(d, i, { article, config, shared }) {
  const votes = votesOf(d);
  const date = article.sitting_date;
  const isShared = shared != null && d.decisionId === shared;
  return html`<details class="decision" id="beschluss-${i + 1}"${isShared ? html` open data-shared` : ''}>
    <summary>
      <h2>${d.headline}</h2>
      <span class="fold-icon" aria-hidden="true"></span>
      <span class="decision-meta">
        <span class="result result-${cls(d.result)}">${RESULT_LABEL[d.result] || d.result}</span>
        ${decisionTags(d).map((t) => html`<span>${t}</span>`)}
      </span>
      ${votesLine(votes)}
    </summary>
    <div class="decision-body">
      <p class="official-title">${d.title}</p>
      <p>${d.summary}</p>
      ${decisionContext(d, date)}
      ${votesBox(votes, d.votesNote)}
      ${todo(d.actions)}
      ${d.sources.length ? html`<p class="sources">Quellen: ${d.sources.map((s, j) => html`${j ? ' · ' : ''}<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`)}</p>` : ''}
      <div class="decision-share">${shareSheet({
        url: d.decisionId ? `${config.baseUrl}${decisionPath(article, d)}` : `${config.baseUrl}/artikel/${article.slug}#beschluss-${i + 1}`,
        text: shareText(d.headline, date),
        heading: 'Beschluss teilen',
        eyebrow: `Bundestag · ${day(date)}`,
        headline: d.headline,
        result: d.result,
        context: d.headline,
      })}</div>
    </div>
  </details>`;
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

// The article, or – under decisionPath, `shared` naming the decision – the
// same article with that decision open and a preview card of its own for
// messengers and networks. Both have the article as their canonical address.
export function articlePage(view, data) {
  const { article, shared = null } = data;
  const { config } = view;
  const b = article.body || {};
  const decisions = b.decisions || [];
  const sharedDecision = shared != null ? decisions.find((d) => d.decisionId === shared) : null;
  // An article from before the programme comparison was dropped: its
  // introduction talked about the programmes, so it waits for the rewrite.
  const intro = (b.version || 1) >= 2 ? b.intro || [] : [];
  const url = `${config.baseUrl}/artikel/${article.slug}`;
  const body = html`<article>
    <header class="article-head">
      <p class="eyebrow">Sitzung des Bundestags vom ${formatDateDe(article.sitting_date)}</p>
      <h1>${article.title}</h1>
      <p class="lede">${article.lede}</p>
      <p class="meta">${plural(decisions.length, 'Beschluss', 'Beschlüsse')}${
        new Date(article.created_at) - new Date(article.published_at) > 30 * 60 * 1000 ? html` · aktualisiert ${formatDateTimeDe(article.created_at)}` : ''
      } · <a href="#kommentare">${plural(data.comments.length, 'Kommentar', 'Kommentare')}</a> · <a href="/ueber#methode">So entsteht dieser Artikel</a></p>
      <div class="article-share">${shareSheet({
        url,
        text: shareText(article.title, article.sitting_date),
        heading: 'Artikel teilen',
        eyebrow: `Sitzung vom ${day(article.sitting_date)} · ${plural(decisions.length, 'Beschluss', 'Beschlüsse')}`,
        headline: article.title,
      })}</div>
    </header>
    ${article.status === 'hidden' ? html`<div class="notice error"><div>Dieser Artikel ist ausgeblendet und nur für Admins sichtbar.</div></div>` : ''}
    <div class="article-body">
      <div class="intro">${intro.map((p) => html`<p>${p}</p>`)}</div>
      ${b.commonGround ? html`<aside class="panel common-ground"><h2>Gemeinsamkeiten</h2><p>${b.commonGround}</p></aside>` : ''}
      ${decisions.length
        ? html`<div class="decisions-head"><h2 class="section-title">Die Beschlüsse im Einzelnen</h2><button type="button" class="link fold-all" hidden>Alle aufklappen</button></div>`
        : ''}
      ${decisions.map((d, i) => decisionSection(d, i, { article, config, shared }))}
      ${(b.others || []).length
        ? html`<section class="others"><h2>Weitere Beschlüsse des Tages</h2><ul>${b.others.map(
            (o) => html`<li>${o.title} <span class="meta">– ${o.tenor || RESULT_LABEL[o.outcome] || o.outcome}</span></li>`,
          )}</ul></section>`
        : ''}
      <aside class="panel disclaimer">
        <p><strong>So entsteht dieser Artikel.</strong> Die Beschlüsse und Drucksachen stammen aus der Parlamentsdokumentation (DIP) des Bundestags, das Abstimmungsverhalten aus dem Plenarprotokoll. Die Texte schreibt eine KI (Claude von Anthropic) nur auf Grundlage dieser Dokumente, sachlich und ohne Wertung. Fehler sind trotzdem möglich – deshalb ist jede Quelle verlinkt. <a href="/ueber#methode">Mehr zur Methode</a> · <a href="${EXPLAINER_PATH}">So arbeitet der Bundestag</a></p>
      </aside>
    </div>
  </article>
  ${commentsSection(view, data)}`;
  const published = new Date(article.published_at).toISOString();
  const modified = new Date(Math.max(new Date(article.created_at), new Date(article.published_at))).toISOString();
  const sittingDay = day(article.sitting_date);
  return layout(view, {
    // The date belongs in the title: people search for "Bundestag 25. September".
    title: shareText(sharedDecision ? sharedDecision.headline : article.title, article.sitting_date),
    description: sharedDecision
      ? truncate(`${RESULT_LABEL[sharedDecision.result] || 'Beschlossen'} im Bundestag am ${sittingDay}. ${sharedDecision.summary}`, 200)
      : truncate(article.lede, 200),
    body,
    canonical: `/artikel/${article.slug}`,
    ogPath: sharedDecision ? decisionPath(article, sharedDecision) : '',
    ogType: 'article',
    scripts: ['article', 'share'],
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
            image: [shareImage(config)],
            articleSection: 'Bundestag',
            keywords: ['Bundestag', 'Beschluss', 'Abstimmung', ...decisions.map((d) => d.headline)].join(', '),
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
              { '@type': 'ListItem', position: 3, name: `Sitzung vom ${sittingDay}`, item: url },
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

export function aboutPage(view) {
  const body = html`<article class="prose">
  <h1>Über uns</h1>
  <p class="lede">Der Bundestag entscheidet jede Sitzungswoche über Dutzende Vorlagen – in einer Sprache, die kaum jemand liest. ${view.config.siteName} erklärt ruhig und verständlich, was beschlossen wurde, wie die Fraktionen abgestimmt haben und was das bedeutet. Und es zeigt, was jede und jeder selbst beitragen kann.</p>
  <h2>Überparteilich</h2>
  <p>Wir empfehlen keine Partei und bewerten keinen Beschluss – ob er gut oder schlecht ist, entscheidest du selbst. Die Fraktionen stehen überall so, wie sie im Plenarsaal sitzen: von links nach rechts aus Sicht des Präsidiums. Die Seite verwendet keine Farbe, die eine Partei für sich beansprucht; Parteifarben erscheinen nur als kleiner Punkt zur Orientierung, für alle gleich groß. Ob eine Fraktion mit Ja oder Nein gestimmt hat, zeigt die Form, nicht die Farbe: Ja ist gefüllt, Nein umrandet, Enthaltung gestrichelt.</p>
  <h2 id="methode">Methode</h2>
  <ol>
    <li><strong>Beschlüsse:</strong> Wir lesen die Parlamentsdokumentation <a href="https://dip.bundestag.de">DIP</a> des Bundestags aus. Als Beschluss zählt jede Abstimmung im Plenum über eine Vorlage – Überweisungen an Ausschüsse zählen nicht. Gesetze und namentliche Abstimmungen kommen zuerst; Petitionen und Wahlen stehen am Ende unter „Weitere Beschlüsse“.</li>
    <li><strong>Abstimmungsverhalten:</strong> Wie die Fraktionen gestimmt haben, steht im Plenarprotokoll. Wir suchen dort die Abstimmungsformel zum jeweiligen Beschluss („mit den Stimmen der … gegen die Stimmen der …“). Liegt das Protokoll noch nicht vor, steht dort „unbekannt“, und der Artikel wird nachgetragen, sobald es da ist.</li>
    <li><strong>Erklärung:</strong> Eine KI (Claude von Anthropic) schreibt aus diesen Dokumenten – der Vorlage, dem Bericht des Ausschusses und dem Protokoll –, was beschlossen wurde und was es bedeutet. Sie darf nur die gelieferten Dokumente verwenden, soll ohne Wertung schreiben und nichts hinzufügen. Was ein Ergebnis im Verfahren bedeutet („Was heißt das?“), ist dagegen fest von uns geschrieben, nicht von der KI.</li>
    <li><strong>Vorschau:</strong> Die <a href="/vorschau">Vorschau</a> liest die offizielle Tagesordnung des Bundestags. Ob an einem Punkt abgestimmt wird, steht in ihrer Sprache: Zweite und dritte Beratung eines Gesetzentwurfs und die Beratung einer Beschlussempfehlung enden mit einer Abstimmung, eine erste Beratung mit der Überweisung in die Ausschüsse. Anträge ohne Ausschussbericht werden meist überwiesen und stehen deshalb unter „Abstimmung möglich“. Unter „Worum es geht“ und „Aus dem Ausschuss“ fasst eine kleinere KI (Claude Haiku) die Drucksachen dahinter in wenigen Sätzen zusammen – bei Gesetzentwürfen aus dem Vorblatt mit Problem, Lösung und Kosten, beim Ausschuss aus seinem Bericht. Die Zusammenfassungen geben wieder, wie die Drucksache ihr Anliegen begründet; das Original ist verlinkt.</li>
    <li><strong>Was du tun kannst:</strong> Wo es zu einem Beschluss etwas Konkretes zu tun gibt, schlagen wir bis zu zwei Schritte vor – meist für dich selbst, seltener mit anderen oder in der Politik. Sie sollen unabhängig davon hilfreich sein, wie du zu dem Beschluss stehst. Allgemeine Tipps wie „frag deine Abgeordneten“ wiederholen wir nicht unter jedem Beschluss; sie stehen unter <a href="/mitmachen">Mitmachen</a>. Links führen nur zu einer festen, von uns geprüften Liste von Angeboten.</li>
  </ol>
  <h2>Grenzen</h2>
  <p>Eine KI kann sich irren, und Amtsdokumente lassen sich nicht immer in drei Sätzen fassen. Maßgeblich sind die verlinkten Originale. Wenn dir ein Fehler auffällt, schreib es gern in die Diskussion unter dem Artikel.</p>
  </article>`;
  return layout(view, {
    title: 'Über uns und Methode',
    description: 'Wie wir die Beschlüsse des Bundestags erklären: Datenquellen, Abstimmungsverhalten, KI-Texte und ihre Grenzen.',
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
    <li><strong>KI-Texte:</strong> Anthropic (USA) – erhält ausschließlich öffentliche Dokumente des Bundestags, keine Nutzerdaten.</li>
  </ul>
  <h2>Deine Rechte</h2>
  <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie auf Beschwerde bei einer Aufsichtsbehörde. Dein Konto samt Kommentaren kannst du jederzeit selbst unter <a href="/konto">Konto</a> löschen.</p>
  </article>`;
  return layout(view, { title: 'Datenschutz', body });
}

export function errorPage(view, status, message) {
  const titles = { 400: 'Das hat nicht geklappt', 403: 'Nicht erlaubt', 404: 'Seite nicht gefunden', 413: 'Zu groß', 429: 'Kurz durchatmen', 500: 'Da ist etwas schiefgegangen' };
  const body = html`<section class="empty">${hallMark()}<h1>${titles[status] || 'Fehler'}</h1><p>${message || 'Diese Seite gibt es nicht.'}</p><p><a class="button ghost" href="/">Zur Startseite</a></p></section>`;
  return layout(view, { title: titles[status] || 'Fehler', body, noindex: true });
}

export function rssFeed(config, articles) {
  const x = (s) => escapeHtml(s);
  const items = articles
    .map(
      (a) => `<item><title>${x(a.title)}</title><link>${x(`${config.baseUrl}/artikel/${a.slug}`)}</link><guid>${x(`${config.baseUrl}/artikel/${a.slug}`)}</guid><pubDate>${new Date(a.published_at).toUTCString()}</pubDate><description>${x(a.lede)}</description></item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${x(config.siteName)}</title><link>${x(config.baseUrl)}</link><description>Was der Bundestag beschließt – verständlich erklärt.</description><language>de</language>${items}</channel></rss>`;
}
