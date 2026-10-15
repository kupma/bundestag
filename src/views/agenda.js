// The preview (/vorschau): what the Bundestag is going to decide in its next
// sitting days, from its own agenda. Items that end in a vote come first, in
// the order of the day; the rest (first readings, debates, question time) is
// folded away.

import { KIND_ORDER } from '../agenda.js';
import { html } from '../html.js';
import { vorlagenOf } from '../summaries.js';
import { addDays, formatDateDe, formatDateTimeDe, truncate } from '../text.js';
import { EXPLAINER_PATH } from './explainer.js';
import { AGENDA_KIND_LABEL, AGENDA_PART_LABEL } from './labels.js';
import { layout } from './layout.js';
import { pendingMark } from './shapes.js';

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

const shortDay = (ymd) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${ymd}T12:00:00Z`));

// "TOP 8" and "ZP 3" are the agenda's shorthand; written out, readers
// without the shorthand know what the number is.
const topLabel = (top) => (!top ? '' : /^\d/.test(top) ? `Tagesordnungspunkt ${top}` : top.replace(/^ZP\s*/i, 'Zusatzpunkt '));

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
  return html`<p class="agenda-status"><span class="result result-${cls}">${item.status}</span>${item.statusDetail ? html` <span class="meta">${truncate(item.statusDetail, 200)}</span>` : ''}</p>`;
}

function when(item, date) {
  const top = topLabel(item.top);
  if (!item.time && !top) return '';
  return html`<p class="agenda-when">${item.time ? html`Geplant um <time datetime="${date}T${item.time}">${clock(item.time)} Uhr</time>` : ''}${item.time && top ? ' · ' : ''}${top}</p>`;
}

function links(item, { search = true } = {}) {
  const out = [];
  if (search && item.title) out.push(html`<a href="/programme?q=${encodeURIComponent(truncate(item.title, 80))}">Was die Parteien versprochen haben →</a>`);
  for (const d of item.drucksachen.slice(0, 4)) out.push(html`<a href="${d.url}" target="_blank" rel="noopener">Drucksache ${d.nummer} ↗</a>`);
  if (item.link) out.push(html`<a href="${item.link}" target="_blank" rel="noopener">Beim Bundestag ↗</a>`);
  return out.length ? html`<p class="agenda-links">${out.map((l, i) => html`${i ? ' · ' : ''}${l}`)}</p>` : '';
}

// A long text is shortened, and the whole of it is a click away (a native
// <details>, so it works without JavaScript; the stylesheet hides the short
// version while the long one is open).
function clip(short, full) {
  return html`<div class="clip"><div class="clip-short">${short}</div><details class="clip-more"><summary><span class="clip-open">Ganzen Text lesen</span><span class="clip-close">Weniger anzeigen</span></summary>${full}</details></div>`;
}

const PART_MAX = 170;
const PARTS_SHOWN = 6;

// One part says it in a sentence; several are listed, each with what it is.
function description(item, max) {
  const parts = item.parts.filter((p) => p.text).map((p) => ({ ...p, text: p.text.replace(/^[a-z]{1,2}\)\s*/, '') }));
  if (!parts.length) return '';
  if (parts.length === 1) {
    const { text } = parts[0];
    const full = html`<p class="agenda-text">${text}</p>`;
    return text.length > max ? clip(html`<p class="agenda-text">${truncate(text, max)}</p>`, full) : full;
  }
  const list = (shown, cut) =>
    html`<ul class="agenda-parts">${shown.map(
      (p) => html`<li>${AGENDA_PART_LABEL[p.kind] ? html`<span class="pill">${AGENDA_PART_LABEL[p.kind]}</span> ` : ''}${cut ? truncate(p.text, PART_MAX) : p.text}</li>`,
    )}</ul>`;
  const short = html`${list(parts.slice(0, PARTS_SHOWN), true)}${parts.length > PARTS_SHOWN ? html`<p class="meta">und ${parts.length - PARTS_SHOWN} weitere</p>` : ''}`;
  const shortened = parts.length > PARTS_SHOWN || parts.some((p) => p.text.length > PART_MAX);
  return shortened ? clip(short, list(parts, false)) : short;
}

// "Worum es geht": the summaries of the item's Drucksachen (src/summaries.js),
// marked as written by an AI, with the original one click away.
function found(item, summaries) {
  return vorlagenOf(item)
    .map((v) => ({ ...v, s: summaries.get(v.nummer) }))
    .filter((v) => v.s && v.s.summary);
}

const originalUrl = (item, v) => v.s.pdf_url || (item.drucksachen.find((d) => d.nummer === v.nummer) || {}).url || '';

function credit(item, list) {
  return html`KI-Zusammenfassung ${list.length > 1 ? 'der Drucksachen' : 'der Drucksache'} ${list.map((v, i) => {
    const url = originalUrl(item, v);
    return html`${i ? ', ' : ''}${url ? html`<a href="${url}" target="_blank" rel="noopener">${v.nummer} ↗</a>` : v.nummer}`;
  })}`;
}

function about(item, summaries) {
  const list = found(item, summaries);
  if (!list.length) return '';
  return html`<div class="agenda-about">
    <p class="agenda-about-title">Worum es geht</p>
    ${list.map((v) => html`<p>${list.length > 1 && v.s.typ ? html`<span class="pill">${v.s.typ}</span> ` : ''}${v.s.summary}</p>`)}
    <p class="meta">${credit(item, list)} · kann Fehler enthalten, maßgeblich ist das Original</p>
  </div>`;
}

function voteItem(item, date, summaries) {
  return html`<li class="agenda-item">
    ${when(item, date)}
    <h3>${item.title}</h3>
    <p class="agenda-kind">${pendingMark()}<span>${AGENDA_KIND_LABEL[item.kind]}${item.votes > 1 ? ` · ${plural(item.votes, 'Abstimmung', 'Abstimmungen')}` : ''}</span></p>
    ${about(item, summaries)}
    ${description(item, 320)}
    ${statusPill(item)}
    ${links(item, { search: item.kind !== 'abschliessend' })}
  </li>`;
}

function possibleItem(item, date, summaries) {
  return html`<li class="agenda-item quiet">
    ${when(item, date)}
    <h3>${item.title}</h3>
    ${about(item, summaries)}
    ${description(item, 220)}
    ${statusPill(item)}
    ${links(item)}
  </li>`;
}

function restItem(item, date, summaries) {
  const label = AGENDA_KIND_LABEL[item.kind];
  const list = found(item, summaries);
  return html`<li>
    ${when(item, date)}
    <strong>${item.title}</strong>${label ? html` <span class="meta">– ${label}</span>` : ''}
    ${item.status ? html` <span class="meta">(${item.status})</span>` : ''}
    ${item.link ? html` <a class="meta" href="${item.link}" target="_blank" rel="noopener">Beim Bundestag ↗</a>` : ''}
    ${list.length ? html`<p class="agenda-rest-about">${list.map((v) => html`${v.s.summary} `)}<span class="meta">(${credit(item, list)})</span></p>` : ''}
  </li>`;
}

function daySection(day, today, summaries) {
  const date = day.sitting_date;
  const { votes, possible, rest, count } = splitDay(day.items);
  return html`<section class="agenda-day" id="tag-${date}" aria-labelledby="tag-${date}-titel">
    <h2 class="agenda-date" id="tag-${date}-titel">${formatDateDe(date)}${date === today ? html` <span class="pill">Heute</span>` : ''}</h2>
    <p class="meta">${day.session ? `${day.session}. Sitzung · ` : ''}${plural(count, 'Tagesordnungspunkt', 'Tagesordnungspunkte')}${votes.length ? ` · ${plural(votes.length, 'Punkt', 'Punkte')} mit Abstimmung` : ''}</p>
    ${votes.length
      ? html`<ol class="agenda-items">${votes.map((i) => voteItem(i, date, summaries))}</ol>`
      : html`<p>Für diesen Tag ist keine Abstimmung angekündigt.</p>`}
    ${possible.length
      ? html`<h3 class="agenda-sub">Abstimmung möglich</h3>
        <p class="meta">Anträge ohne Ausschussbericht gehen meist erst in die Ausschüsse. Verlangt eine Fraktion die sofortige Abstimmung, wird schon an diesem Tag entschieden.</p>
        <ol class="agenda-items">${possible.map((i) => possibleItem(i, date, summaries))}</ol>`
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
    <p class="lede">Die Tagesordnung der kommenden Sitzungstage – vorn die Punkte, an deren Ende abgestimmt wird. Nach der Sitzung legen wir jeden Beschluss neben die Wahlprogramme.</p>
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
      <p><strong>Worum es geht.</strong> Diese Zusammenfassungen schreibt eine KI (Claude von Anthropic) aus dem Anfang der jeweiligen Drucksache – bei Gesetzentwürfen ist das das Vorblatt mit Problem, Lösung und Kosten. Sie geben wieder, wie die Drucksache ihr Anliegen begründet, nicht unsere Einschätzung. Fehler sind möglich; maßgeblich ist das verlinkte Original.</p>
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
