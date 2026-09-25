// Shared test fixtures: an in-memory Postgres (PGlite), fake outside services,
// and PDFs generated on the fly. Nothing here touches the network.

import http from 'node:http';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate, openDatabase } from '../src/db.js';

export function makeConfig(overrides = {}) {
  const config = loadConfig({ PGLITE_DIR: 'memory://', BASE_URL: 'http://localhost:3999', SCHEDULER: 'off' });
  return { ...config, ...overrides };
}

export async function makeDb() {
  const db = await openDatabase({ databaseUrl: '', pgliteDir: 'memory://' });
  await migrate(db);
  return db;
}

export function fakeMailer() {
  const sent = [];
  return {
    configured: true,
    sent,
    async sendMail(letter) {
      sent.push(letter);
      return { ok: true, id: `mail-${sent.length}` };
    },
  };
}

export async function makePdf(pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = pdf.addPage([595, 842]);
    let y = 800;
    for (const line of [].concat(lines)) {
      page.drawText(line, { x: 50, y, size: 11, font });
      y -= 16;
    }
  }
  return Buffer.from(await pdf.save());
}

// DIP /vorgangsposition documents as the API returns them (abridged).
export function samplePositions(date = '2026-09-24') {
  return [
    {
      id: '9001',
      vorgangsposition: '2. Beratung',
      zuordnung: 'BT',
      vorgangstyp: 'Gesetzgebung',
      titel: 'Gesetz zur Verlängerung der Mietpreisbremse',
      dokumentart: 'Plenarprotokoll',
      vorgang_id: '318001',
      datum: date,
      fundstelle: { pdf_url: 'https://dserver.bundestag.de/btp/21/21045.pdf#P.4321', dokumentnummer: '21/45', herausgeber: 'BT', seite: '4321B' },
      beschlussfassung: [
        { beschlusstenor: 'Annahme der Vorlage in Ausschussfassung', abstimmungsart: 'Handzeichen', dokumentnummer: '21/1234', grundlage: 'Beschlussempfehlung 21/1300' },
      ],
    },
    {
      id: '9002',
      vorgangsposition: '3. Beratung',
      zuordnung: 'BT',
      vorgangstyp: 'Gesetzgebung',
      titel: 'Gesetz zur Verlängerung der Mietpreisbremse',
      dokumentart: 'Plenarprotokoll',
      vorgang_id: '318001',
      datum: date,
      fundstelle: { pdf_url: 'https://dserver.bundestag.de/btp/21/21045.pdf#P.4329', dokumentnummer: '21/45', herausgeber: 'BT' },
      beschlussfassung: [{ beschlusstenor: 'Annahme', abstimmungsart: 'Handzeichen', dokumentnummer: '21/1234' }],
    },
    {
      id: '9003',
      vorgangsposition: 'Beratung',
      zuordnung: 'BT',
      vorgangstyp: 'Antrag',
      titel: 'Kostenloses Mittagessen an allen Schulen',
      dokumentart: 'Plenarprotokoll',
      vorgang_id: '318002',
      datum: date,
      fundstelle: { pdf_url: 'https://dserver.bundestag.de/btp/21/21045.pdf#P.4340', dokumentnummer: '21/45', herausgeber: 'BT' },
      beschlussfassung: [{ beschlusstenor: 'Ablehnung der Vorlage', abstimmungsart: 'Handzeichen', dokumentnummer: '21/1400' }],
    },
    {
      id: '9004',
      vorgangsposition: '1. Beratung',
      zuordnung: 'BT',
      vorgangstyp: 'Gesetzgebung',
      titel: 'Gesetz zur Modernisierung des Wehrdienstes',
      dokumentart: 'Plenarprotokoll',
      vorgang_id: '318003',
      datum: date,
      fundstelle: { dokumentnummer: '21/45', herausgeber: 'BT' },
      beschlussfassung: [{ beschlusstenor: 'Überweisung', dokumentnummer: '21/1500' }],
    },
    {
      id: '9005',
      vorgangsposition: 'Beratung',
      zuordnung: 'BT',
      vorgangstyp: 'Petition',
      titel: 'Sammelübersicht 42 zu Petitionen',
      dokumentart: 'Plenarprotokoll',
      vorgang_id: '318004',
      datum: date,
      fundstelle: { dokumentnummer: '21/45', herausgeber: 'BT' },
      beschlussfassung: [{ beschlusstenor: 'Annahme der Beschlussempfehlung', dokumentnummer: '21/1600' }],
    },
    {
      id: '9006',
      vorgangsposition: 'Beschluss',
      zuordnung: 'BR',
      vorgangstyp: 'Gesetzgebung',
      titel: 'Bundesrat: Gesetz zur Verlängerung der Mietpreisbremse',
      dokumentart: 'Plenarprotokoll',
      vorgang_id: '318001',
      datum: date,
      beschlussfassung: [{ beschlusstenor: 'Zustimmung' }],
    },
    {
      id: '9007',
      vorgangsposition: 'Gesetzentwurf',
      zuordnung: 'BT',
      vorgangstyp: 'Gesetzgebung',
      titel: 'Gesetz zur Verlängerung der Mietpreisbremse',
      dokumentart: 'Drucksache',
      vorgang_id: '318001',
      datum: date,
    },
  ];
}

export const SAMPLE_PROTOCOL = `Präsidentin: Ich rufe den Tagesordnungspunkt 5 auf: Zweite und dritte Beratung des von der Bundesregierung eingebrachten Entwurfs eines Gesetzes zur Verlängerung der Mietpreisbremse Drucksache 21/1234 Beschlussempfehlung und Bericht des Rechtsausschusses Drucksache 21/1300. Das Wort hat die Abgeordnete Musterfrau. Mieten sind die soziale Frage unserer Zeit. (Beifall bei der SPD) Wir kommen zur Abstimmung über den Gesetzentwurf auf Drucksache 21/1234. Der Rechtsausschuss empfiehlt unter Buchstabe a seiner Beschlussempfehlung auf Drucksache 21/1300, den Gesetzentwurf in der Ausschussfassung anzunehmen. Wer stimmt dafür? – Wer stimmt dagegen? – Wer enthält sich? – Der Gesetzentwurf ist damit in zweiter Beratung mit den Stimmen der Fraktionen der CDU/CSU und SPD gegen die Stimmen der Fraktion der AfD bei Enthaltung der Fraktionen Bündnis 90/Die Grünen und Die Linke angenommen. Dritte Beratung und Schlussabstimmung. Der Gesetzentwurf ist mit dem gleichen Stimmenverhältnis wie zuvor angenommen. Ich rufe den Tagesordnungspunkt 6 auf: Antrag der Fraktion Die Linke Kostenloses Mittagessen an allen Schulen Drucksache 21/1400. Wir stimmen ab über den Antrag auf Drucksache 21/1400. Der Antrag ist mit den Stimmen der Fraktionen CDU/CSU, AfD und SPD gegen die Stimmen der Fraktion Die Linke bei Enthaltung der Fraktion Bündnis 90/Die Grünen abgelehnt.`;

export function fakeDip({ positions = samplePositions(), protocol = SAMPLE_PROTOCOL } = {}) {
  const calls = [];
  return {
    calls,
    async positions(start, end) {
      calls.push(['positions', start, end]);
      return positions.filter((p) => p.datum >= start && p.datum <= end);
    },
    async vorgang(id) {
      calls.push(['vorgang', id]);
      return {
        id,
        abstract: id === '318001' ? 'Die Mietpreisbremse wird bis 2029 verlängert.' : 'Kostenloses Mittagessen für alle Schulkinder.',
        deskriptor: [{ name: id === '318001' ? 'Mietpreisbremse' : 'Schulverpflegung' }],
        initiative: [id === '318001' ? 'Bundesregierung' : 'Fraktion Die Linke'],
      };
    },
    async drucksacheText(nummer) {
      calls.push(['drucksache', nummer]);
      return { dokumentnummer: nummer, drucksachetyp: 'Gesetzentwurf', titel: 'Entwurf', text: 'A. Problem und Ziel: Mieten steigen. B. Lösung: Verlängerung.', fundstelle: { pdf_url: `https://dserver.bundestag.de/btd/21/${nummer.replace('/', '_')}.pdf` } };
    },
    async protocolText(date) {
      calls.push(['protocol', date]);
      return protocol ? { dokumentnummer: '21/45', text: protocol } : null;
    },
  };
}

// Answers the three kinds of structured request the article pipeline makes,
// the way a well-behaved model would – plus exactly the misbehaviour the checks
// exist for: a quote that is not in its passage, and a verdict that cites a
// passage it was never shown.
export function fakeClaude() {
  const calls = [];
  return {
    model: 'fake-model',
    calls,
    async json({ prompt, schema }) {
      calls.push({ prompt, schema });
      const usage = { input: 100, output: 50 };
      if (schema.required.includes('items')) {
        const ids = [...prompt.matchAll(/<beschluss id="(\d+)">/g)].map((m) => Number(m[1]));
        return { data: { items: ids.map((id) => ({ decision_id: id, queries: ['Mietpreisbremse', 'Mieten', 'Mittagessen Schule', 'Schulessen'] })) }, usage };
      }
      if (schema.required.includes('parties')) {
        const programs = [...prompt.matchAll(/<programm id="(\d+)"[^>]*>([\s\S]*?)<\/programm>/g)].map((m) => ({
          id: Number(m[1]),
          passages: [...m[2].matchAll(/<passage id="(\d+)" seite="\d+">\n([\s\S]*?)\n<\/passage>/g)].map((p) => ({ id: Number(p[1]), text: p[2] })),
        }));
        const parties = programs.map((p, i) => {
          const first = p.passages[0];
          if (i === 0 && first) {
            return { program_id: p.id, vote: 'dafür', alignment: 'entspricht', assessment: 'Das Programm fordert genau das.', citations: [{ passage_id: first.id, quote: first.text.slice(0, 40) }] };
          }
          if (i === 1 && first) {
            return { program_id: p.id, vote: 'dagegen', alignment: 'widerspricht', assessment: 'Das Programm will etwas anderes.', citations: [{ passage_id: first.id, quote: 'Dieses Zitat steht nirgends im Programm.' }] };
          }
          return { program_id: p.id, vote: 'enthalten', alignment: 'entspricht', assessment: 'Behauptung ohne Beleg.', citations: [{ passage_id: 999999, quote: 'erfunden' }] };
        });
        // Four suggestions, one with an unknown level and one with an unknown
        // link: the checks keep three, drop the level, and unlink the link.
        const actions = [
          { level: 'alltag', text: 'Prüfe mit dem Mietspiegel, ob deine Miete zulässig ist.', resource: 'mieterbund' },
          { level: 'politik', text: 'Frag deine Abgeordneten, wie es weitergeht.', resource: 'abgeordnete' },
          { level: 'unsinn', text: 'Das hier fliegt raus.', resource: 'keine' },
          { level: 'gemeinsam', text: 'Sprich mit deinen Nachbarn über ihre Erfahrungen.', resource: 'erfunden' },
          { level: 'gemeinsam', text: 'Ein vierter Vorschlag ist einer zu viel.', resource: 'keine' },
        ];
        return {
          data: { headline: 'Mietpreisbremse verlängert', summary: 'Der Bundestag hat entschieden.', result: 'angenommen', votes_note: 'CDU/CSU und SPD dafür, AfD dagegen.', actions, parties },
          usage,
        };
      }
      return {
        data: { title: 'Mietpreisbremse bleibt – wie versprochen?', lede: 'Ein Tag im Bundestag.', intro: ['Absatz eins.', 'Absatz zwei.'], common_ground: 'Beim Mieterschutz stimmte eine breite Mehrheit zu.' },
        usage,
      };
    },
  };
}

// Every test request comes from 127.0.0.1, so the per-IP limits a real
// visitor gets would stop the suite after a few registrations.
const TEST_LIMITS = { register: { windowMs: 1000, max: 1000 }, login: { windowMs: 1000, max: 1000 } };

export async function startApp(ctx) {
  const handler = createApp(ctx, { limits: TEST_LIMITS });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, handler, close: () => new Promise((resolve) => server.close(resolve)) };
}

// A tiny browser: keeps cookies, sends Origin on POST, never follows redirects.
export function browser(base) {
  const jar = new Map();
  async function request(method, path, { form, headers = {}, body, origin = base } = {}) {
    const h = { ...headers };
    if (jar.size) h.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    if (method === 'POST' && origin) h.Origin = origin;
    let payload = body;
    if (form) {
      h['Content-Type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(form).toString();
    }
    const res = await fetch(base + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i);
      const v = pair.slice(i + 1);
      if (!v || /Max-Age=0/.test(c)) jar.delete(k);
      else jar.set(k, v);
    }
    return { status: res.status, location: res.headers.get('location'), headers: res.headers, text: await res.text() };
  }
  return {
    jar,
    get: (path, opts) => request('GET', path, opts),
    post: (path, form, opts = {}) => request('POST', path, { form, ...opts }),
  };
}
