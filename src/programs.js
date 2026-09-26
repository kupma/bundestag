// The library: election programmes (and the coalition agreement) as PDFs in,
// page-exact passages out. Every passage knows its page, so an article can
// link to "Wahlprogramm SPD, S. 42" and the link opens the PDF on that page.

import { extractText, getDocumentProxy } from 'unpdf';
import { chunkPage, cleanPageText, slugify } from './text.js';

export const KINDS = {
  wahlprogramm: 'Wahlprogramm',
  koalitionsvertrag: 'Koalitionsvertrag',
  sonstiges: 'Dokument',
};

const MAX_PDF_BYTES = 80 * 1024 * 1024;

export async function extractPages(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [String(text || '')];
}

export async function downloadPdf(url, { fetch = globalThis.fetch } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Das ist keine gültige Adresse.');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Nur http- und https-Adressen sind erlaubt.');
  const res = await fetch(parsed, {
    redirect: 'follow',
    // Some party sites turn away requests without a browser-like agent.
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Versprochen-Beschlossen/1.0)', Accept: 'application/pdf,*/*;q=0.8' },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_PDF_BYTES) throw new Error('Die Datei ist größer als 80 MB.');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new Error('Die Datei ist größer als 80 MB.');
  assertPdf(bytes);
  return bytes;
}

export function assertPdf(bytes) {
  if (!bytes || bytes.length < 5 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Die Datei ist kein PDF.');
  }
}

export function validateProgramMeta(meta) {
  const errors = [];
  const party = String(meta.party || '').trim();
  const title = String(meta.title || '').trim();
  const kind = KINDS[meta.kind] ? meta.kind : 'wahlprogramm';
  const election = String(meta.election || '').trim();
  const sourceUrl = String(meta.sourceUrl || '').trim();
  if (!party || party.length > 60) errors.push('Partei fehlt (höchstens 60 Zeichen).');
  if (!title || title.length > 200) errors.push('Titel fehlt (höchstens 200 Zeichen).');
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) errors.push('Die Quelle muss eine http(s)-Adresse sein.');
  return { errors, meta: { party, title, kind, election, sourceUrl } };
}

async function uniqueSlug(db, base) {
  const root = slugify(base) || 'dokument';
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    const taken = await db.one('select 1 as x from programs where slug = $1', [slug]);
    if (!taken) return slug;
  }
  return `${root}-${Date.now()}`;
}

// Creates the programme row straight away (status "processing") so the admin
// page can show it, then does the slow part.
export async function createProgram(db, meta) {
  const slug = await uniqueSlug(db, `${meta.party} ${meta.election || meta.title}`);
  return db.one(
    `insert into programs (slug, party, title, kind, election, source_url, source_key)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [slug, meta.party, meta.title, meta.kind, meta.election, meta.sourceUrl, meta.sourceKey || null],
  );
}

// `pages` may be passed in when the caller has already read the PDF (the
// standard library checks a download before importing it).
export async function ingestProgramPdf({ db, embedder, log = () => {} }, programId, bytes, { pages: known = null } = {}) {
  try {
    assertPdf(bytes);
    const pages = known || (await extractPages(bytes));
    const chunks = [];
    pages.forEach((pageText, i) => {
      chunkPage(cleanPageText(pageText)).forEach((text, ord) => chunks.push({ page: i + 1, ord, text }));
    });
    if (!chunks.length) {
      throw new Error('Das PDF enthält keinen auslesbaren Text. Ist es ein Scan? Dann muss es vorher per Texterkennung (OCR) bearbeitet werden.');
    }
    log(`${pages.length} Seiten, ${chunks.length} Passagen`);

    let embeddings = null;
    if (embedder) {
      embeddings = await embedder.embed(
        chunks.map((c) => c.text),
        'document',
      );
      log(`${embeddings.length} Embeddings (${embedder.model})`);
    }

    await db.tx(async (q) => {
      await q.query('delete from program_chunks where program_id = $1', [programId]);
      const BATCH = 200;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const params = [];
        const values = slice.map((c, j) => {
          params.push(programId, c.page, c.ord, c.text, embeddings ? embeddings[i + j] : null);
          const b = j * 5;
          return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::real[])`;
        });
        await q.query(`insert into program_chunks (program_id, page, ord, text, embedding) values ${values.join(', ')}`, params);
      }
      await q.query(
        `update programs set status = 'ready', error = null, page_count = $2, embedding_model = $3 where id = $1`,
        [programId, pages.length, embedder ? embedder.model : null],
      );
    });
    return { pages: pages.length, chunks: chunks.length };
  } catch (err) {
    await db.query(`update programs set status = 'error', error = $2 where id = $1`, [programId, String(err.message).slice(0, 500)]);
    throw err;
  }
}

// Link to the page in the original PDF. `#page=` is understood by the PDF
// viewers in Chrome, Firefox, Safari and Acrobat.
export function pdfPageUrl(sourceUrl, page) {
  if (!sourceUrl) return '';
  return `${sourceUrl.replace(/#.*$/, '')}#page=${page}`;
}

// A dot of colour per party, so a reader can find their party in a long
// comparison at a glance. A class rather than an inline style, because the
// Content-Security-Policy allows no inline styles. Unknown parties get grey.
// The groups in the order they sit in the plenary hall, from left to right as
// seen from the President's chair (21st Bundestag). Everything that lists
// parties uses this order: it is the Bundestag's own, so it favours nobody.
// Documents that belong to no single group (the coalition agreement) go last.
const SEAT_ORDER = ['p-linke', 'p-bsw', 'p-gruene', 'p-spd', 'p-ssw', 'p-fdp', 'p-union', 'p-afd', 'p-other', 'p-koalition'];

export const seatRank = (party) => SEAT_ORDER.indexOf(partyClass(party));

export const bySeat = (a, b) => seatRank(a.party) - seatRank(b.party) || String(a.party).localeCompare(String(b.party), 'de');

export function partyClass(party) {
  const p = String(party || '').toLowerCase();
  if (/koalition|cdu.*spd|spd.*cdu/.test(p)) return 'p-koalition';
  if (/cdu|csu|union/.test(p)) return 'p-union';
  if (/spd/.test(p)) return 'p-spd';
  if (/grüne|gruene|bündnis/.test(p)) return 'p-gruene';
  if (/afd/.test(p)) return 'p-afd';
  if (/linke/.test(p)) return 'p-linke';
  if (/fdp/.test(p)) return 'p-fdp';
  if (/bsw|wagenknecht/.test(p)) return 'p-bsw';
  if (/ssw/.test(p)) return 'p-ssw';
  return 'p-other';
}
