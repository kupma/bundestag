// The preview (/vorschau): what the Bundestag is going to decide in its next
// sitting days, from its own agenda. Items that end in a vote come first, in
// the order of the day; the rest (first readings, debates, question time) is
// folded away.

import { KIND_ORDER } from '../agenda.js';
import { html } from '../html.js';
import { addDays, formatDateDe, formatDateTimeDe, truncate } from '../text.js';
import { EXPLAINER_PATH } from './explainer.js';
import { AGENDA_KIND_LABEL, AGENDA_PART_LABEL } from './labels.js';
import { layout } from './layout.js';
import { pendingMark } from './shapes.js';

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

const shortDay = (ymd) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${ymd}T12:00:00Z`));

// "TOP 8", "ZP 3", or several at once ("39, ZP 7, TOP 19b") – the agenda's
// shorthand, written out so readers without it know what the number is.
const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}` : xs[0] || '');

function topLabel(top) {
  const tops = [];
  const extra = [];
  const other = [];
  for (const t of String(top || '').split(/\s*[,;]\s*/).filter(Boolean)) {
    let m;
    if ((m = t.match(/^(?:TOP\s*)?(\d+[a-z]?)$/i))) tops.push(m[1]);
    else if ((m = t.match(/^ZP\s*(\d+[a-z]?)$/i))) extra.push(m[1]);
    else other.push(t);
  }
  return [
    tops.length ? `${tops.length > 1 ? 'Tagesordnungspunkte' : 'Tagesordnungspunkt'} ${and(tops)}` : '',
    extra.length ? `${extra.length > 1 ? 'Zusatzpunkte' : 'Zusatzpunkt'} ${and(extra)}` : '',
    ...other,
  ]
    .filter(Boolean)
    .join(', ');
}

// "09:00" reads "9:00 Uhr".
const clock = (time) => time.replace(/^0(?=\d:)/, '');

// Opening, breaks and closing are on the agenda too, but say nothing.
const PROCEDURAL = /^Sitzungs(?:eröffnung|ende|unterbrechung)|^(?:Eröffnung|Unterbrechung|Ende) der Sitzung/i;

const byWeight = (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || String(a.time).localeCompare(String(b.time));

export function splitDay(items) {
  const listed = (items || []).filter((i) => !PROCEDURAL.test(i.title));
  return {
    votes: listed.filter((i) => i.vote),
    possible: listed.filter((i) => i.kind === 'antrag'),
    rest: listed.filter((i) => !i.vote && i.kind !== 'antrag'),
    count: listed.length,
  };
}

function statusPill(item) {
  if (!item.status) return '';
  const cls = /angenommen|beschlossen|gewählt/i.test(item.status) && !/Überweisung/i.test(item.status)
    ? 'angenommen'
    : /abgelehnt/i.test(item.status)
      ? 'abgelehnt'
      : 'sonstiges';
  return html`<span class="agenda-status"><span class="result result-${cls}">${item.status}</span></span>`;
}

const statusDetail = (item) => (item.statusDetail ? html`<p class="agenda-status-detail"><strong>Ergebnis laut Bundestag:</strong> ${item.statusDetail}</p>` : '');

function when(item, date) {
  const top = topLabel(item.top);
  if (!item.time && !top) return '';
  return html`<span class="agenda-when">${item.time ? html`Geplant um <time datetime="${date}T${item.time}">${clock(item.time)} Uhr</time>` : ''}${item.time && top ? ' · ' : ''}${top}</span>`;
}

function links(item) {
  const out = [];
  for (const d of item.drucksachen.slice(0, 4)) out.push(html`<a href="${d.url}" target="_blank" rel="noopener">Drucksache ${d.nummer} ↗</a>`);
  if (item.link) out.push(html`<a href="${item.link}" target="_blank" rel="noopener">Beim Bundestag ↗</a>`);
  return out.length ? html`<p class="agenda-links">${out.map((l, i) => html`${i ? ' · ' : ''}${l}`)}</p>` : '';
}

// The agenda's own words for each part – procedure first, the title at the
// end – in full, folded away: the page says it shorter above them.
function wording(item) {
  const parts = item.parts.filter((p) => p.text).map((p) => ({ ...p, text: p.text.replace(/^[a-z]{1,2}\)\s*/, '') }));
  if (!parts.length) return '';
  const body =
    parts.length === 1
      ? html`<p class="agenda-text">${parts[0].text}</p>`
      : html`<ul class="agenda-parts">${parts.map(
          (p) => html`<li>${AGENDA_PART_LABEL[p.kind] ? html`<span class="pill">${AGENDA_PART_LABEL[p.kind]}</span> ` : ''}${p.text}</li>`,
        )}</ul>`;
  return html`<details class="agenda-wording"><summary>Wortlaut der Tagesordnung</summary>${body}</details>`;
}

// The parts of an item, each with the Drucksache it is about and, where one
// has been written, its summary (src/summaries.js).
function entriesOf(item, summaries) {
  const parts = item.parts || [];
  return parts.map((part) => {
    const nummer = (part.drucksachen || [])[0] || (parts.length === 1 && item.drucksachen[0] ? item.drucksachen[0].nummer : '');
    const report = part.report && part.report !== nummer ? { nummer: part.report, s: summaries.get(part.report) || null } : null;
    return { part, nummer, s: (nummer && summaries.get(nummer)) || null, report };
  });
}

// The one the item is mainly about: the bill, else the first with a summary.
const mainOf = (entries) =>
  entries.find((e) => e.part.kind === 'gesetz' && e.s) || entries.find((e) => e.s) || entries.find((e) => e.part.kind === 'gesetz') || entries[0];

const isBundle = (item) => item.kind === 'abschliessend' || /vereinfachten Verfahren/i.test(item.title || '');

const originalUrl = (item, e) => (e.s && e.s.pdf_url) || (item.drucksachen.find((d) => d.nummer === e.nummer) || {}).url || '';

const drucksacheLink = (item, e) => {
  const url = originalUrl(item, e);
  return url ? html`<a href="${url}" target="_blank" rel="noopener">${e.nummer} ↗</a>` : e.nummer;
};

// "Antrag · Grüne", "Gesetzentwurf · Bundesregierung"
const gistMeta = (part) => [part.doc, part.by].filter(Boolean).join(' · ');

const DOC_PLURAL = {
  Antrag: ['Antrag', 'Anträge'],
  Gesetzentwurf: ['Gesetzentwurf', 'Gesetzentwürfe'],
  Entschließungsantrag: ['Entschließungsantrag', 'Entschließungsanträge'],
  Petitionen: ['Sammelübersicht zu Petitionen', 'Sammelübersichten zu Petitionen'],
  'EU-Vorhaben': ['EU-Vorhaben', 'EU-Vorhaben'],
  Unterrichtung: ['Unterrichtung', 'Unterrichtungen'],
  Wahl: ['Wahl', 'Wahlen'],
};

// What the folded item says in one line.
function teaser(item, entries, main) {
  if (isBundle(item)) {
    const counts = new Map();
    for (const e of entries) {
      const key = DOC_PLURAL[e.part.doc] ? e.part.doc : '';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const named = [...counts].filter(([k]) => k).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${DOC_PLURAL[k][n === 1 ? 0 : 1]}`);
    const rest = counts.get('') || 0;
    if (rest) named.push(`${rest} ${named.length ? (rest === 1 ? 'weitere Vorlage' : 'weitere Vorlagen') : rest === 1 ? 'Vorlage' : 'Vorlagen'}`);
    return named.length ? html`<span class="agenda-teaser">Ohne Debatte: ${and(named)}.</span>` : '';
  }
  if (!main) return '';
  const line = (main.s && main.s.kurz) || main.part.title || truncate(main.part.text.replace(/^[a-z]{1,2}\)\s*/, ''), 140);
  const more = entries.length - 1;
  return html`<span class="agenda-teaser">${line}</span>${
    more > 0 ? html`<span class="agenda-more meta">Gemeinsam beraten mit ${more === 1 ? 'einer weiteren Vorlage' : `${more} weiteren Vorlagen`}</span>` : ''
  }`;
}

// After a first reading: the committees the bill goes to.
const referral = (part) =>
  part.referral ? html`<p class="agenda-referral"><strong>Geht zur Beratung an:</strong> ${part.referral}</p>` : '';

// Inside: what it is about, at more length, marked as written by an AI.
function about(item, main) {
  if (!main || !main.s) return main ? referral(main.part) : '';
  return html`<div class="agenda-about">
    <p class="agenda-about-title">Worum es geht${gistMeta(main.part) ? html` <span class="meta">· ${gistMeta(main.part)}</span>` : ''}</p>
    <p>${main.s.summary}</p>
    <p class="meta">KI-Zusammenfassung der Drucksache ${drucksacheLink(item, main)} · kann Fehler enthalten, maßgeblich ist das Original</p>
  </div>${referral(main.part)}`;
}

// What the committee made of it: its report, summarised. Only once the
// committee is done – before the second and third reading.
function committee(item, main) {
  if (!main || !main.report || !main.report.s) return '';
  const e = { nummer: main.report.nummer, s: main.report.s };
  return html`<div class="agenda-about agenda-committee">
    <p class="agenda-about-title">Aus dem Ausschuss</p>
    <p>${e.s.summary}</p>
    <p class="meta">KI-Zusammenfassung des Ausschussberichts ${drucksacheLink(item, e)} · <a href="${EXPLAINER_PATH}#gesetz">Was ein Ausschuss macht</a></p>
  </div>`;
}

// The other Drucksachen debated under the same item, one line each.
function together(item, entries, main) {
  const others = entries.filter((e) => e !== main);
  if (!others.length) return '';
  return html`<div class="agenda-together">
    <p class="agenda-about-title">Gemeinsam beraten</p>
    <p class="meta">Zu einem Thema berät der Bundestag oft mehrere Vorlagen zusammen – etwa einen Gesetzentwurf und Anträge anderer Fraktionen dazu. Über jede wird einzeln entschieden.</p>
    <ul>${others.map(
      (e) => html`<li>
        ${AGENDA_PART_LABEL[e.part.kind] ? html`<span class="pill">${AGENDA_PART_LABEL[e.part.kind]}</span> ` : ''}<strong>${e.part.title || truncate(e.part.text.replace(/^[a-z]{1,2}\)\s*/, ''), 160)}</strong>${gistMeta(e.part) ? html` <span class="meta">${gistMeta(e.part)}</span>` : ''}
        ${e.s && e.s.kurz ? html`<span class="agenda-together-kurz">${e.s.kurz} <span class="meta">(KI-Zusammenfassung, Drucksache ${drucksacheLink(item, e)})</span></span>` : ''}
        ${e.report && e.report.s && e.report.s.kurz ? html`<span class="agenda-together-kurz"><strong>Ausschuss:</strong> ${e.report.s.kurz} <span class="meta">(KI-Zusammenfassung, Drucksache ${drucksacheLink(item, e.report)})</span></span>` : ''}
        ${e.part.referral ? html`<span class="agenda-together-kurz meta">Geht zur Beratung an: ${e.part.referral}</span>` : ''}
      </li>`,
    )}</ul>
  </div>`;
}

// Votes without debate: what each of them is, one line each – the petition
// overviews, often a dozen, in one line together.
function bundleList(entries) {
  const petitions = entries.filter((e) => e.part.doc === 'Petitionen');
  const lines = entries
    .filter((e) => petitions.length < 2 || e.part.doc !== 'Petitionen')
    .map((e) => html`<li><strong>${e.part.title || truncate(e.part.text.replace(/^[a-z]{1,2}\)\s*/, ''), 160)}</strong>${gistMeta(e.part) ? html` <span class="meta">${gistMeta(e.part)}</span>` : ''}</li>`);
  if (petitions.length > 1) {
    const numbers = petitions.map((e) => Number((e.part.title.match(/Sammelübersicht (\d+)/) || [])[1])).filter(Boolean).sort((a, b) => a - b);
    const range = numbers.length === petitions.length ? ` (Nr. ${numbers[0]} bis ${numbers[numbers.length - 1]})` : '';
    lines.push(html`<li><strong>${petitions.length} Sammelübersichten zu Petitionen${range}</strong> <span class="meta">Entscheidungen über Bitten und Beschwerden von Bürgerinnen und Bürgern, auf Empfehlung des Petitionsausschusses</span></li>`);
  }
  return html`<ul class="agenda-bundle">${lines}</ul>`;
}

// Each item is a fold (native <details>, works without JavaScript): closed,
// the time, the title, what is decided and one line on what it is about;
// open, the rest.
function item(entry, date, summaries, { quiet = false } = {}) {
  const entries = entriesOf(entry, summaries);
  const main = isBundle(entry) ? null : mainOf(entries);
  return html`<li class="agenda-item${quiet ? ' quiet' : ''}">
    <details class="agenda-fold">
      <summary>
        ${when(entry, date)}
        <h3>${entry.title}</h3>
        <span class="fold-icon" aria-hidden="true"></span>
        ${quiet ? '' : html`<span class="agenda-kind">${pendingMark()}<span>${AGENDA_KIND_LABEL[entry.kind]}${entry.votes > 1 ? ` · ${plural(entry.votes, 'Abstimmung', 'Abstimmungen')}` : ''}</span></span>`}
        ${teaser(entry, entries, main)}
        ${statusPill(entry)}
      </summary>
      <div class="agenda-body">
        ${isBundle(entry) ? bundleList(entries) : html`${about(entry, main)}${committee(entry, main)}${together(entry, entries, main)}`}
        ${statusDetail(entry)}
        ${wording(entry)}
        ${links(entry)}
      </div>
    </details>
  </li>`;
}

function restItem(entry, date, summaries) {
  const label = AGENDA_KIND_LABEL[entry.kind];
  const main = isBundle(entry) ? null : mainOf(entriesOf(entry, summaries));
  return html`<li>
    ${when(entry, date)}
    <strong>${entry.title}</strong>${label ? html` <span class="meta">– ${label}</span>` : ''}
    ${entry.status ? html` <span class="meta">(${entry.status})</span>` : ''}
    ${entry.link ? html` <a class="meta" href="${entry.link}" target="_blank" rel="noopener">Beim Bundestag ↗</a>` : ''}
    ${main && main.s && main.s.kurz ? html`<p class="agenda-rest-about">${main.s.kurz} <span class="meta">(KI-Zusammenfassung, Drucksache ${drucksacheLink(entry, main)})</span></p>` : ''}
    ${main && main.part.referral ? html`<p class="agenda-rest-about meta">Geht zur Beratung an: ${main.part.referral}</p>` : ''}
  </li>`;
}

function daySection(day, today, summaries) {
  const date = day.sitting_date;
  const { votes, possible, rest, count } = splitDay(day.items);
  return html`<section class="agenda-day" id="tag-${date}" aria-labelledby="tag-${date}-titel">
    <h2 class="agenda-date" id="tag-${date}-titel">${formatDateDe(date)}${date === today ? html` <span class="pill">Heute</span>` : ''}</h2>
    <p class="meta">${day.session ? `${day.session}. Sitzung · ` : ''}${plural(count, 'Tagesordnungspunkt', 'Tagesordnungspunkte')}${votes.length ? ` · ${plural(votes.length, 'Punkt', 'Punkte')} mit Abstimmung` : ''}</p>
    ${votes.length
      ? html`<ol class="agenda-items">${votes.map((i) => item(i, date, summaries))}</ol>`
      : html`<p>Für diesen Tag ist keine Abstimmung angekündigt.</p>`}
    ${possible.length
      ? html`<h3 class="agenda-sub">Abstimmung möglich</h3>
        <p class="meta">Anträge ohne Ausschussbericht gehen meist erst in die Ausschüsse. Verlangt eine Fraktion die sofortige Abstimmung, wird schon an diesem Tag entschieden.</p>
        <ol class="agenda-items">${possible.map((i) => item(i, date, summaries, { quiet: true }))}</ol>`
      : ''}
    ${rest.length
      ? html`<details class="agenda-rest"><summary>Außerdem auf der Tagesordnung (${rest.length})</summary><ol class="agenda-list">${rest.map((i) => restItem(i, date, summaries))}</ol></details>`
      : ''}
  </section>`;
}

export function previewPage(view, { days, today, fetchedAt, summaries = new Map() }) {
  const body = html`<div class="narrow">
    <p class="eyebrow">Vorschau</p>
    <h1>Darüber stimmt der Bundestag ab</h1>
    <p class="lede">Die Tagesordnung der kommenden Sitzungstage – vorn die Punkte, an deren Ende abgestimmt wird. Nach der Sitzung erklären wir jeden Beschluss und wie die Fraktionen abgestimmt haben.</p>
    <p class="meta">Was „erste Lesung“, „Beschlussempfehlung“ oder „Überweisung“ heißt und wann ein Gesetz wirklich gilt, steht unter <a href="${EXPLAINER_PATH}">So arbeitet der Bundestag</a>.</p>
    ${days.length > 1
      ? html`<nav class="theme-nav" aria-label="Sitzungstage">${days.map((d) => {
          const n = splitDay(d.items).votes.length;
          return html`<a href="#tag-${d.sitting_date}">${shortDay(d.sitting_date)}${n ? html` · ${n}` : ''}</a>`;
        })}</nav>`
      : ''}
  </div>
  <div class="narrow">
    ${days.length
      ? days.map((d) => daySection(d, today, summaries))
      : html`<section class="empty">${pendingMark({ size: 'lg' })}
          <h2>Gerade steht keine Sitzung an</h2>
          <p>Die Tagesordnung der nächsten Sitzungswoche erscheint hier, sobald der Bundestag sie veröffentlicht – meist in der Woche davor. Wann das Parlament tagt, steht im <a href="https://www.bundestag.de/parlament/plenum/sitzungskalender" target="_blank" rel="noopener">Sitzungskalender des Bundestags ↗</a>.</p>
        </section>`}
    <aside class="panel disclaimer" id="so-lesen">
      <p><strong>Woran wir Abstimmungen erkennen.</strong> An der Sprache der Tagesordnung: Die zweite und dritte Beratung eines Gesetzentwurfs und die Beratung einer Beschlussempfehlung enden mit einer Abstimmung, ebenso Wahlen und die „abschließenden Beratungen ohne Aussprache“. Eine erste Beratung endet mit der Überweisung in die Ausschüsse. Die Tagesordnung kann sich bis zur Sitzung ändern, und die Zeiten sind geplant, nicht garantiert. <a href="${EXPLAINER_PATH}#gesetz">Wie ein Gesetz entsteht</a></p>
      <p><strong>Worum es geht und Aus dem Ausschuss.</strong> Diese Zusammenfassungen schreibt eine KI (Claude von Anthropic) aus dem Anfang der jeweiligen Drucksache – bei Gesetzentwürfen ist das das Vorblatt mit Problem, Lösung und Kosten, bei Ausschussberichten die Empfehlung und der Bericht über die Beratungen. Sie geben wieder, wie die Drucksache ihr Anliegen begründet, nicht unsere Einschätzung. Fehler sind möglich; maßgeblich ist das verlinkte Original.</p>
      <p class="meta">Quelle: <a href="https://www.bundestag.de/tagesordnungen" target="_blank" rel="noopener">Tagesordnung des Deutschen Bundestags ↗</a>${fetchedAt ? `, zuletzt abgerufen ${formatDateTimeDe(fetchedAt)}` : ''}.</p>
    </aside>
  </div>`;
  return layout(view, {
    title: 'Vorschau: Abstimmungen im Bundestag',
    description: 'Worüber der Bundestag in den nächsten Sitzungstagen abstimmt: Gesetze, Beschlussempfehlungen und Wahlen aus der Tagesordnung – überparteilich und übersichtlich.',
    body,
    canonical: '/vorschau',
  });
}

// On the home page: the next sitting week in a few lines.
export function agendaTeaser(days) {
  if (!days || !days.length) return '';
  const first = days[0].sitting_date;
  const week = days.filter((d) => d.sitting_date <= addDays(first, 6));
  return html`<section class="card preview-teaser" aria-labelledby="vorschau-titel">
    <p class="eyebrow">Vorschau</p>
    <h2 id="vorschau-titel">${pendingMark()}<a href="/vorschau">Demnächst im Bundestag</a></h2>
    <ul class="teaser-days">${week.map((d) => {
      const votes = splitDay(d.items).votes;
      // the named topics; "Abschließende Beratungen ohne Aussprache" is a heading, not one
      const named = votes.filter((v) => v.kind !== 'abschliessend').sort(byWeight);
      return html`<li><strong>${shortDay(d.sitting_date)}:</strong> ${
        votes.length
          ? html`${plural(votes.length, 'Punkt', 'Punkte')} mit Abstimmung${
              named.length ? html`${named.length > 3 ? ', darunter ' : ': '}${named.slice(0, 3).map((v, i) => html`${i ? ', ' : ''}${truncate(v.title, 60)}`)}` : ''
            }`
          : 'keine Abstimmung angekündigt'
      }</li>`;
    })}</ul>
    <p class="meta"><a href="/vorschau">Zur Vorschau mit allen Tagesordnungspunkten →</a></p>
  </section>`;
}
