// The preview (/vorschau): what the Bundestag is going to decide in its next
// sitting days, from its own agenda. Items that end in a vote come first; the
// rest of the day (first readings, debates, question time) is folded away.

import { KIND_ORDER } from '../agenda.js';
import { html } from '../html.js';
import { addDays, formatDateDe, formatDateTimeDe, truncate } from '../text.js';
import { AGENDA_KIND_LABEL, AGENDA_PART_LABEL } from './labels.js';
import { layout } from './layout.js';
import { pendingMark } from './shapes.js';

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

const shortDay = (ymd) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${ymd}T12:00:00Z`));

const topLabel = (top) => (!top ? '' : /^\d/.test(top) ? `TOP ${top}` : top);

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
  return html`<p class="agenda-when">${item.time ? html`<time datetime="${date}T${item.time}">${item.time} Uhr</time>` : ''}${item.time && top ? ' · ' : ''}${top}</p>`;
}

function links(item, { search = true } = {}) {
  const out = [];
  if (search && item.title) out.push(html`<a href="/programme?q=${encodeURIComponent(truncate(item.title, 80))}">Was die Parteien versprochen haben →</a>`);
  for (const d of item.drucksachen.slice(0, 4)) out.push(html`<a href="${d.url}" target="_blank" rel="noopener">Drucksache ${d.nummer} ↗</a>`);
  if (item.link) out.push(html`<a href="${item.link}" target="_blank" rel="noopener">Beim Bundestag ↗</a>`);
  return out.length ? html`<p class="agenda-links">${out.map((l, i) => html`${i ? ' · ' : ''}${l}`)}</p>` : '';
}

// One part says it in a sentence; several are listed, each with what it is.
function description(item, max) {
  const parts = item.parts.filter((p) => p.text);
  if (parts.length <= 1) return parts.length ? html`<p class="agenda-text">${truncate(parts[0].text, max)}</p>` : '';
  const shown = parts.slice(0, 6);
  return html`<ul class="agenda-parts">${shown.map(
    (p) => html`<li>${AGENDA_PART_LABEL[p.kind] ? html`<span class="pill">${AGENDA_PART_LABEL[p.kind]}</span> ` : ''}${truncate(p.text.replace(/^[a-z]{1,2}\)\s*/, ''), 170)}</li>`,
  )}</ul>${parts.length > shown.length ? html`<p class="meta">und ${parts.length - shown.length} weitere</p>` : ''}`;
}

function voteItem(item, date) {
  return html`<li class="agenda-item">
    ${when(item, date)}
    <h3>${item.title}</h3>
    <p class="agenda-kind">${pendingMark()}<span>${AGENDA_KIND_LABEL[item.kind]}${item.votes > 1 ? ` · ${plural(item.votes, 'Abstimmung', 'Abstimmungen')}` : ''}</span></p>
    ${description(item, 320)}
    ${statusPill(item)}
    ${links(item, { search: item.kind !== 'abschliessend' })}
  </li>`;
}

function possibleItem(item, date) {
  return html`<li class="agenda-item quiet">
    ${when(item, date)}
    <h3>${item.title}</h3>
    ${description(item, 220)}
    ${statusPill(item)}
    ${links(item)}
  </li>`;
}

function restItem(item, date) {
  const label = AGENDA_KIND_LABEL[item.kind];
  return html`<li>
    ${when(item, date)}
    <strong>${item.title}</strong>${label ? html` <span class="meta">– ${label}</span>` : ''}
    ${item.status ? html` <span class="meta">(${item.status})</span>` : ''}
    ${item.link ? html` <a class="meta" href="${item.link}" target="_blank" rel="noopener">Beim Bundestag ↗</a>` : ''}
  </li>`;
}

function daySection(day, today) {
  const date = day.sitting_date;
  const { votes, possible, rest, count } = splitDay(day.items);
  return html`<section class="agenda-day" id="tag-${date}" aria-labelledby="tag-${date}-titel">
    <h2 class="agenda-date" id="tag-${date}-titel">${formatDateDe(date)}${date === today ? html` <span class="pill">Heute</span>` : ''}</h2>
    <p class="meta">${day.session ? `${day.session}. Sitzung · ` : ''}${plural(count, 'Tagesordnungspunkt', 'Tagesordnungspunkte')}${votes.length ? ` · ${plural(votes.length, 'Punkt', 'Punkte')} mit Abstimmung` : ''}</p>
    ${votes.length
      ? html`<ol class="agenda-items">${[...votes].sort(byWeight).map((i) => voteItem(i, date))}</ol>`
      : html`<p>Für diesen Tag ist keine Abstimmung angekündigt.</p>`}
    ${possible.length
      ? html`<h3 class="agenda-sub">Abstimmung möglich</h3>
        <p class="meta">Anträge ohne Ausschussbericht gehen meist erst in die Ausschüsse. Verlangt eine Fraktion die sofortige Abstimmung, wird schon an diesem Tag entschieden.</p>
        <ol class="agenda-items">${possible.map((i) => possibleItem(i, date))}</ol>`
      : ''}
    ${rest.length
      ? html`<details class="agenda-rest"><summary>Außerdem auf der Tagesordnung (${rest.length})</summary><ol class="agenda-list">${rest.map((i) => restItem(i, date))}</ol></details>`
      : ''}
  </section>`;
}

export function previewPage(view, { days, today, fetchedAt }) {
  const body = html`<div class="narrow">
    <p class="eyebrow">Vorschau</p>
    <h1>Darüber stimmt der Bundestag ab</h1>
    <p class="lede">Die Tagesordnung der kommenden Sitzungstage – vorn die Punkte, an deren Ende abgestimmt wird. Nach der Sitzung legen wir jeden Beschluss neben die Wahlprogramme.</p>
    ${days.length > 1
      ? html`<nav class="theme-nav" aria-label="Sitzungstage">${days.map((d) => {
          const n = splitDay(d.items).votes.length;
          return html`<a href="#tag-${d.sitting_date}">${shortDay(d.sitting_date)}${n ? html` · ${n}` : ''}</a>`;
        })}</nav>`
      : ''}
  </div>
  <div class="narrow">
    ${days.length
      ? days.map((d) => daySection(d, today))
      : html`<section class="empty">${pendingMark({ size: 'lg' })}
          <h2>Gerade steht keine Sitzung an</h2>
          <p>Die Tagesordnung der nächsten Sitzungswoche erscheint hier, sobald der Bundestag sie veröffentlicht – meist in der Woche davor. Wann das Parlament tagt, steht im <a href="https://www.bundestag.de/parlament/plenum/sitzungskalender" target="_blank" rel="noopener">Sitzungskalender des Bundestags ↗</a>.</p>
        </section>`}
    <aside class="panel disclaimer" id="so-lesen">
      <p><strong>Woran wir Abstimmungen erkennen.</strong> An der Sprache der Tagesordnung: Die zweite und dritte Beratung eines Gesetzentwurfs und die Beratung einer Beschlussempfehlung enden mit einer Abstimmung, ebenso Wahlen und die „abschließenden Beratungen ohne Aussprache“. Eine erste Beratung endet mit der Überweisung in die Ausschüsse. Die Tagesordnung kann sich bis zur Sitzung ändern, und die Zeiten sind geplant, nicht garantiert.</p>
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
