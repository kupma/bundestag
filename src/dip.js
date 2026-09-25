// The Bundestag's documentation system DIP (Dokumentations- und
// Informationssystem für Parlamentsmaterialien) and what this app takes from it.
//
// API: https://search.dip.bundestag.de/api/v1 — documented at
// https://dip.bundestag.de/über-dip/hilfe/api. Every request needs an API key;
// DIP publishes a public key on that page (it is rotated about once a year),
// and a personal one can be requested by email from the Parlamentsdokumentation.
//
// A "decision" here is a Vorgangsposition from a Bundestag plenary protocol
// that carries a Beschlussfassung (the Bundestag voted on something), grouped
// by Vorgang and day, so the second and third reading of a bill on the same day
// are one decision. Referrals to committee ("Überweisung") are not decisions.

export class DipError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'DipError';
    this.status = status;
  }
}

export function createDipClient({ apiKey, baseUrl, fetch = globalThis.fetch }) {
  async function get(path, params = {}) {
    if (!apiKey) throw new DipError(0, 'DIP_API_KEY ist nicht gesetzt.');
    const url = new URL(baseUrl + path);
    for (const [k, v] of Object.entries(params)) {
      for (const val of [].concat(v)) if (val != null && val !== '') url.searchParams.append(k, String(val));
    }
    url.searchParams.set('format', 'json');
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `ApiKey ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(45000),
      });
    } catch (err) {
      throw new DipError(0, `DIP nicht erreichbar: ${err.message}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint = res.status === 401 ? ' (API-Key ungültig oder abgelaufen?)' : '';
      throw new DipError(res.status, `DIP antwortete ${res.status}${hint}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  // DIP pages with a cursor: the same request again with `cursor` set gives the
  // next page, and an unchanged cursor means there are no more.
  async function all(path, params, maxPages = 40) {
    const out = [];
    let cursor;
    for (let i = 0; i < maxPages; i++) {
      const data = await get(path, { ...params, cursor });
      const docs = data.documents || [];
      out.push(...docs);
      if (!docs.length || !data.cursor || data.cursor === cursor) break;
      cursor = data.cursor;
    }
    return out;
  }

  return {
    get,
    positions: (start, end) => all('/vorgangsposition', { 'f.datum.start': start, 'f.datum.end': end }),
    vorgang: (id) => get(`/vorgang/${encodeURIComponent(id)}`),
    async drucksacheText(nummer) {
      const data = await get('/drucksache-text', { 'f.dokumentnummer': nummer });
      const docs = data.documents || [];
      return docs.find((d) => d.herausgeber === 'BT') || docs[0] || null;
    },
    async protocolText(date, dokumentnummer) {
      const data = await get('/plenarprotokoll-text', { 'f.datum.start': date, 'f.datum.end': date });
      const docs = (data.documents || []).filter((d) => !d.herausgeber || d.herausgeber === 'BT');
      return docs.find((d) => dokumentnummer && d.dokumentnummer === dokumentnummer) || docs[0] || null;
    },
  };
}

// --- turning positions into decisions -------------------------------------------

const DRUCKSACHE_RE = /\b\d{1,2}\/\d{1,6}\b/g;

export function classifyOutcome(tenor) {
  const t = String(tenor || '').toLowerCase();
  if (/ablehnung|abgelehnt/.test(t)) return 'abgelehnt';
  if (/annahme|angenommen|zustimmung|bestätigung|billigung|wahl|gewählt/.test(t)) return 'angenommen';
  if (/erledig/.test(t)) return 'erledigt';
  return 'sonstiges';
}

// How much a decision deserves a place in the article. Bills beat motions,
// roll-call votes beat hand votes, petitions and elections to boards go to the
// short list at the end.
export function importance(d) {
  let score = 0;
  const typ = `${d.vorgangstyp} ${d.title}`.toLowerCase();
  if (/gesetz/.test(d.vorgangstyp.toLowerCase())) score += 50;
  else if (/antrag/.test(d.vorgangstyp.toLowerCase())) score += 20;
  else if (/entschließung|beschlussempfehlung|verordnung|eu-vorlage|unterrichtung/.test(typ)) score += 10;
  if (d.beschluesse.some((b) => /namentlich/i.test(b.abstimmungsart))) score += 30;
  if (/sammelübersicht|petition/.test(typ)) score -= 100;
  if (/^wahl |wahl (der|des|eines|einer|von) /.test(d.title.toLowerCase()) || /wahlvorschlag/.test(typ)) score -= 40;
  if (/immunität|geschäftsordnung/.test(typ)) score -= 40;
  return score;
}

export const IN_DEPTH_MIN_IMPORTANCE = 0;

export function extractDecisions(positions) {
  const byKey = new Map();
  for (const p of positions) {
    if (!p || (p.zuordnung && p.zuordnung !== 'BT')) continue;
    if (p.dokumentart && p.dokumentart !== 'Plenarprotokoll') continue;
    const beschluesse = (p.beschlussfassung || [])
      .filter((b) => b && b.beschlusstenor && !/überweisung/i.test(b.beschlusstenor))
      .map((b) => ({
        tenor: String(b.beschlusstenor),
        abstimmungsart: String(b.abstimmungsart || ''),
        bemerkung: String(b.abstimm_ergebnis_bemerkung || ''),
        grundlage: String(b.grundlage || ''),
        dokumentnummer: String(b.dokumentnummer || ''),
        mehrheit: String(b.mehrheit || ''),
        seite: String(b.seite || ''),
      }));
    if (!beschluesse.length || !p.vorgang_id || !p.datum) continue;

    const date = String(p.datum).slice(0, 10);
    const key = `${p.vorgang_id}@${date}`;
    let d = byKey.get(key);
    if (!d) {
      d = {
        key,
        vorgangId: String(p.vorgang_id),
        date,
        title: String(p.titel || 'Ohne Titel'),
        vorgangstyp: String(p.vorgangstyp || ''),
        positions: [],
        beschluesse: [],
        drucksachen: [],
        protocol: null,
        abstract: '',
        sachgebiete: [],
      };
      byKey.set(key, d);
    }
    d.positions.push({ id: String(p.id), name: String(p.vorgangsposition || '') });
    d.beschluesse.push(...beschluesse);
    if (p.abstract && !d.abstract) d.abstract = String(p.abstract);
    for (const s of [].concat(p.sachgebiet || [])) if (s && !d.sachgebiete.includes(s)) d.sachgebiete.push(String(s));
    const f = p.fundstelle || {};
    if (!d.protocol && (f.pdf_url || f.dokumentnummer)) {
      d.protocol = {
        dokumentnummer: String(f.dokumentnummer || ''),
        pdfUrl: String(f.pdf_url || ''),
        seite: String(f.seite || f.anfangsseite || ''),
      };
    }
    for (const b of beschluesse) {
      for (const n of `${b.dokumentnummer} ${b.grundlage}`.match(DRUCKSACHE_RE) || []) {
        if (!d.drucksachen.includes(n)) d.drucksachen.push(n);
      }
    }
  }

  return [...byKey.values()].map((d) => {
    const last = d.beschluesse[d.beschluesse.length - 1];
    return { ...d, outcome: classifyOutcome(last.tenor), importance: importance(d) };
  });
}

// --- storing them ------------------------------------------------------------------

export async function syncDecisions({ db, dip }, { start, end }) {
  const positions = await dip.positions(start, end);
  const decisions = extractDecisions(positions);
  let inserted = 0;
  let changed = 0;
  for (const d of decisions) {
    const { key, vorgangId, date, title, vorgangstyp, outcome, importance: imp, ...rest } = d;
    const data = { ...rest, title, vorgangstyp };
    const row = await db.one(
      `insert into decisions (dip_key, vorgang_id, sitting_date, title, vorgangstyp, outcome, importance, data)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (dip_key) do update set
         title = excluded.title, vorgangstyp = excluded.vorgangstyp, outcome = excluded.outcome,
         importance = excluded.importance, data = excluded.data, updated_at = now()
       where decisions.data is distinct from excluded.data
       returning (xmax = 0) as inserted`,
      [key, vorgangId, date, title, vorgangstyp, outcome, imp, JSON.stringify(data)],
    );
    if (row && row.inserted) inserted++;
    else if (row) changed++;
  }
  return { positions: positions.length, decisions: decisions.length, inserted, changed };
}

// --- details fetched when an article is written ---------------------------------

// Everything beyond the plenary record: the Vorgang's abstract and subject
// descriptors, the opening of the underlying Drucksache ("A. Problem und Ziel,
// B. Lösung"), and links to the documents. Each lookup is optional; a DIP
// hiccup costs the article a detail, not the article.
export async function fetchDetails(dip, decision, log = () => {}) {
  const details = { abstract: decision.data.abstract || '', deskriptoren: [], initiative: [], beratungsstand: '', drucksachen: [] };
  try {
    const v = await dip.vorgang(decision.vorgang_id);
    if (v) {
      details.abstract = v.abstract || details.abstract;
      details.deskriptoren = (v.deskriptor || []).map((x) => x.name).filter(Boolean).slice(0, 15);
      details.initiative = [].concat(v.initiative || []).filter(Boolean);
      details.beratungsstand = v.beratungsstand || '';
      details.sachgebiete = [].concat(v.sachgebiet || []).filter(Boolean);
    }
  } catch (err) {
    log(`Vorgang ${decision.vorgang_id}: ${err.message}`);
  }
  for (const nummer of (decision.data.drucksachen || []).slice(0, 3)) {
    try {
      const doc = await dip.drucksacheText(nummer);
      if (!doc) continue;
      details.drucksachen.push({
        nummer,
        typ: doc.drucksachetyp || '',
        titel: doc.titel || '',
        pdfUrl: (doc.fundstelle && doc.fundstelle.pdf_url) || '',
        excerpt: String(doc.text || '').replace(/\s+/g, ' ').trim().slice(0, 5000),
      });
    } catch (err) {
      log(`Drucksache ${nummer}: ${err.message}`);
    }
  }
  return details;
}
