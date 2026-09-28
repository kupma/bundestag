// The Bundestag's agenda (Tagesordnung) for the coming sitting days, and which
// of its items end in a vote. This is what the /vorschau page shows.
//
// Source: the same data as https://www.bundestag.de/tagesordnungen, which the
// site loads as JSON from /apps/plenar/plenar/conferenceWeekJSON?year=…&week=…
// (ISO calendar weeks). No key is needed. A response names the sitting days of
// that week ("conferences"), each with its agenda rows, and points to the
// previous and next sitting week. The format follows what the open-source
// DEMOCRACY app reads from the same address (github.com/demokratie-live).
//
// Whether an item ends in a vote is not a field; it is in the wording of the
// agenda, which is the same every week: "Zweite und dritte Beratung" of a bill
// and "Beratung der Beschlussempfehlung" of a committee end in a vote, "Erste
// Beratung" ends in a referral to committee. A motion debated without a
// committee report ("Beratung des Antrags") is usually referred, too – in
// about four out of five cases over the 19th Bundestag – so it counts as a
// possible vote, not an expected one.

import { addDays } from './text.js';

export class AgendaError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AgendaError';
    this.status = status;
  }
}

export function createAgendaClient({ baseUrl, userAgent = 'Mozilla/5.0 (compatible; Wahlwort/1.0)', fetch = globalThis.fetch }) {
  return {
    // One sitting week, or null if the Bundestag has none under that number.
    async week(year, week) {
      const url = `${baseUrl}/conferenceWeekJSON?year=${Number(year)}&week=${Number(week)}`;
      let res;
      try {
        res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      } catch (err) {
        throw new AgendaError(0, `Tagesordnung nicht erreichbar: ${err.message}`);
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new AgendaError(res.status, `Tagesordnung ${year}/${week}: Der Bundestag antwortete ${res.status}.`);
      const body = await res.text();
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        throw new AgendaError(res.status, `Tagesordnung ${year}/${week}: keine JSON-Antwort (${body.slice(0, 80).replace(/\s+/g, ' ')} …)`);
      }
      if (!data || !Array.isArray(data.conferences)) throw new AgendaError(res.status, `Tagesordnung ${year}/${week}: unerwartetes Format.`);
      return data;
    },
  };
}

// --- dates -----------------------------------------------------------------------

// ISO 8601 week of a calendar day: weeks start on Monday, and week 1 is the one
// with the year's first Thursday. The Bundestag numbers its weeks the same way
// ("KW 41").
export function isoWeek(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const year = d.getUTCFullYear();
  const week = Math.floor((d - Date.UTC(year, 0, 1, 12)) / (7 * 86400000)) + 1;
  return { year, week };
}

// The Monday of an ISO week, as 'YYYY-MM-DD'.
export function isoWeekMonday({ year, week }) {
  const jan4 = new Date(Date.UTC(year, 0, 4, 12));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 7 * (week - 1));
  return jan4.toISOString().slice(0, 10);
}

const MONTHS = { januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };

// "12. November 2025" (also with a weekday in front) -> "2025-11-12".
export function parseGermanDate(text) {
  const m = String(text || '').normalize('NFC').match(/(\d{1,2})\.\s*([\p{L}]+)\s+(\d{4})/u);
  const month = m && MONTHS[m[2].toLowerCase()];
  if (!month) return '';
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// --- the agenda text -------------------------------------------------------------

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', ndash: '–', mdash: '—', hellip: '…',
  bdquo: '„', ldquo: '“', rdquo: '”', sbquo: '‚', lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»', sect: '§', euro: '€',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é',
};

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

// The agenda's detail fields are small pieces of HTML: text, <br/> between
// lines, links to Drucksachen. What is kept is the text, line by line; the
// markup is thrown away (and the views escape what is left).
export function htmlLines(fragment) {
  return decodeEntities(
    String(fragment || '')
      .replace(/<br\s*\/?>|<\/(?:p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Only numbers on a "Drucksache(n) …" line count, so "Richtlinie 2019/1937" or
// "Nr. 3/2024" never become a Drucksache. The PDF address follows from the
// number: 21/1234 is btd/21/012/2101234.pdf.
export function drucksachenIn(lines) {
  const out = [];
  for (const line of lines) {
    if (!/Drucksache/i.test(line)) continue;
    for (const m of line.matchAll(/(?<![\d/])(\d{2})\/(\d{1,6})(?![\d/])/g)) {
      const wp = Number(m[1]);
      if (wp < 18 || wp > 30) continue;
      const nummer = `${wp}/${Number(m[2])}`;
      if (out.some((d) => d.nummer === nummer)) continue;
      const padded = String(Number(m[2])).padStart(5, '0');
      out.push({ nummer, url: `https://dserver.bundestag.de/btd/${wp}/${padded.slice(0, 3)}/${wp}${padded}.pdf` });
    }
  }
  return out;
}

// What an agenda text announces, strongest first.
export const KIND_ORDER = ['gesetz', 'beschlussempfehlung', 'abschliessend', 'wahl', 'antrag', 'ueberweisung', 'sonstiges'];
export const VOTE_KINDS = new Set(['gesetz', 'beschlussempfehlung', 'abschliessend', 'wahl']);

export function classifyText(text) {
  const t = String(text || '');
  if (/\b(?:zweite|dritte) Beratung\b|\bSchlussabstimmung\b/i.test(t)) return 'gesetz';
  if (/\bErste Beratung\b/i.test(t)) return 'ueberweisung';
  // the budget week: each ministry's Einzelplan is voted on in the second reading
  if (/\bEinzelplan \d/i.test(t)) return 'gesetz';
  if (/Beschlussempfehlung|BeschlEmpf/i.test(t)) return 'beschlussempfehlung';
  // an election, when the text starts with it; "die Wahl der Vertreter" deep
  // inside the title of a regulation is not one
  if (/^(?:\d+\s*)?(?:[a-z]{1,2}\)\s*)?Wahl(?:en|vorschl\w*)?\b/i.test(t.trim())) return 'wahl';
  if (/\bBeratung (?:des Antrags|der Anträge)\b|\bAntrag der\b/i.test(t)) return 'antrag';
  return 'sonstiges';
}

const strongest = (kinds) => KIND_ORDER.find((k) => kinds.includes(k)) || 'sonstiges';

// Lines that are the procedure rather than the content, and would only repeat
// what the links and the label already say.
const PROCEDURAL = /^(?:Drucksachen?\b|Überweisungsvorschlag|Zu den Reden|Federführung|Mitberatung)/i;

// One agenda row as the page shows it. Items with several parts ("a) …
// b) …") are split, because one part may be a first reading and the next a
// final vote.
export function parseRow(row) {
  const topic = (row && row.topic) || {};
  const status = (row && row.status) || {};
  const title = htmlLines(topic.title).join(' ');
  const lines = htmlLines(topic.detail);

  const lead = [];
  const parts = [];
  for (const line of lines) {
    if (/^[a-z]{1,2}\)\s/.test(line)) parts.push([line]);
    else if (parts.length) parts[parts.length - 1].push(line);
    else lead.push(line);
  }
  if (!parts.length && lead.length) parts.push(lead.splice(0));

  const heading = [title, ...lead].join(' ');
  let kind;
  const partKinds = parts.map((p) => classifyText(p.join(' ')));
  if (/Überweisung(?:en)? im vereinfachten Verfahren/i.test(heading)) kind = 'ueberweisung';
  else if (/Abschließende Beratung(?:en)? ohne Aussprache/i.test(heading)) kind = 'abschliessend';
  else kind = strongest([...partKinds, classifyText(title)]);

  // In "Abschließende Beratungen ohne Aussprache" every motion is voted on
  // at once; nothing there goes to a committee.
  const voteParts = partKinds.filter((k) => VOTE_KINDS.has(k) || (kind === 'abschliessend' && k === 'antrag')).length;

  const time = /^\d{1,2}:\d{2}$/.test(String(row && row.time).trim()) ? String(row.time).trim().padStart(5, '0') : '';
  let link = '';
  const href = String(topic.link || '').trim();
  if (/^\/(?!\/)/.test(href)) link = `https://www.bundestag.de${href}`;
  else if (/^https:\/\/(?:www\.)?bundestag\.de\//.test(href)) link = href;

  return {
    time,
    top: htmlLines(row && row.top).join(' '),
    title: title || (parts[0] ? parts[0][0] : ''),
    parts: parts.map((p, i) => ({ text: p.filter((l) => !PROCEDURAL.test(l)).join(' '), kind: partKinds[i] })),
    kind,
    vote: VOTE_KINDS.has(kind),
    votes: Math.max(voteParts, VOTE_KINDS.has(kind) ? 1 : 0),
    drucksachen: drucksachenIn([title, ...lines]),
    status: htmlLines(status.title).join(' '),
    statusDetail: htmlLines(status.detail).join(' · '),
    link,
  };
}

// A whole week: its sitting days, oldest first.
export function parseWeek(data) {
  const days = [];
  for (const c of (data && data.conferences) || []) {
    const date = parseGermanDate(c && c.conferenceDate && c.conferenceDate.date);
    if (!date) continue;
    const items = ((c && c.rows) || []).map(parseRow).filter((i) => i.title);
    days.push({ date, session: Number(c.conferenceNumber) || null, items });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

// --- keeping it -------------------------------------------------------------------

const weekKey = ({ year, week }) => `${year}-${week}`;
const validWeek = (w) => w && Number.isInteger(Number(w.year)) && Number(w.week) >= 1 && Number(w.week) <= 53;

// Fetches the current week and follows the "next" pointers to the next few
// sitting weeks. A week without sittings (recess) has no page; then it tries
// the calendar week after, within a small budget of requests.
export async function syncAgenda({ db, agenda }, { today, maxWeeks = 3, maxRequests = 10, log = () => {} }) {
  const seen = new Set();
  const days = [];
  let cursor = isoWeek(today);
  let requests = 0;
  let sittingWeeks = 0;
  while (requests < maxRequests && sittingWeeks < maxWeeks && !seen.has(weekKey(cursor))) {
    seen.add(weekKey(cursor));
    requests++;
    const data = await agenda.week(cursor.year, cursor.week);
    const found = data ? parseWeek(data) : [];
    if (found.length) {
      sittingWeeks++;
      days.push(...found);
      log(`KW ${cursor.week}/${cursor.year}: ${found.map((d) => `${d.date} (${d.items.length} Punkte, ${d.items.filter((i) => i.vote).length} mit Abstimmung)`).join(', ')}`);
    } else {
      log(`KW ${cursor.week}/${cursor.year}: keine Sitzung`);
    }
    if (data && validWeek(data.next)) cursor = { year: Number(data.next.year), week: Number(data.next.week) };
    else if (found.length) break; // the last sitting week the Bundestag has planned so far
    else cursor = isoWeek(addDays(isoWeekMonday(cursor), 7));
  }

  const upcoming = days.filter((d) => d.date >= today);
  for (const d of days) {
    await db.query(
      `insert into agenda_days (sitting_date, session, items) values ($1, $2, $3)
       on conflict (sitting_date) do update set
         session = excluded.session, items = excluded.items, fetched_at = now(),
         updated_at = case when agenda_days.items is distinct from excluded.items then now() else agenda_days.updated_at end`,
      [d.date, d.session, JSON.stringify(d.items)],
    );
  }
  // A sitting day that is no longer on the agenda (cancelled or moved) goes,
  // as long as it lies within the stretch just read.
  if (upcoming.length) {
    const last = upcoming[upcoming.length - 1].date;
    await db.query(
      `delete from agenda_days where sitting_date >= $1 and sitting_date <= $2 and not (sitting_date = any($3::text[]))`,
      [today, last, upcoming.map((d) => d.date)],
    );
  }
  return { requests, days: days.length, upcoming: upcoming.length, votes: upcoming.reduce((n, d) => n + d.items.filter((i) => i.vote).length, 0) };
}

// The sitting days from today on, with what is known about them. Days that
// were not confirmed by a fetch for a week are left out rather than shown as
// if they still held.
export async function upcomingAgenda(db, { today, limit = 10 }) {
  const { rows } = await db.query(
    `select sitting_date, session, items, fetched_at from agenda_days
      where sitting_date >= $1 and fetched_at > now() - interval '7 days'
      order by sitting_date limit $2`,
    [today, limit],
  );
  return rows;
}
