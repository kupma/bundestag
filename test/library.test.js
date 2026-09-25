import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgram, extractPages, ingestProgramPdf, pdfPageUrl, validateProgramMeta } from '../src/programs.js';
import { cleanQueries, retrievePassages, rrf, searchLibrary } from '../src/retrieval.js';
import { makeDb, makePdf } from './helpers.js';

const SPD_PAGES = [
  ['Regierungsprogramm der SPD', 'Inhaltsverzeichnis'],
  ['Bezahlbares Wohnen', 'Wir werden die Mietpreisbremse unbefristet verlängern und', 'Mieterinnen und Mieter besser vor Mieterhöhungen schützen.'],
  ['Gute Bildung', 'Jedes Kind bekommt ein kostenloses Mittagessen in Kita und Schule.', 'Wir investieren in Ganztagsschulen.'],
];
const UNION_PAGES = [
  ['Politikwechsel für Deutschland'],
  ['Wohnen', 'Wir setzen auf Neubau statt Regulierung. Mehr Bauland schafft bezahlbare Mieten.'],
];

async function library(db, embedder = null) {
  const out = {};
  for (const [party, pages] of [['SPD', SPD_PAGES], ['CDU/CSU', UNION_PAGES]]) {
    const p = await createProgram(db, { party, title: 'Wahlprogramm 2025', kind: 'wahlprogramm', election: 'Bundestagswahl 2025', sourceUrl: `https://example.org/${party.replace('/', '')}.pdf` });
    await ingestProgramPdf({ db, embedder }, p.id, await makePdf(pages));
    out[party] = p;
  }
  return out;
}

test('PDF pages come out as one text per page', async () => {
  const pages = await extractPages(await makePdf(SPD_PAGES));
  assert.equal(pages.length, 3);
  assert.match(pages[1], /Mietpreisbremse unbefristet verlängern/);
  assert.match(pages[2], /Mittagessen/);
});

test('ingestion stores page-exact passages and marks the programme ready', async () => {
  const db = await makeDb();
  const { SPD } = await library(db);
  const program = await db.one('select * from programs where id = $1', [SPD.id]);
  assert.equal(program.status, 'ready');
  assert.equal(program.page_count, 3);
  assert.equal(program.slug, 'spd-bundestagswahl-2025');
  const { rows } = await db.query('select page, text from program_chunks where program_id = $1 order by page, ord', [SPD.id]);
  assert.deepEqual(rows.map((r) => r.page), [1, 2, 3]);
  assert.match(rows[1].text, /Mietpreisbremse/);
  await db.close();
});

test('a PDF without text and a non-PDF are rejected with a reason', async () => {
  const db = await makeDb();
  const empty = await createProgram(db, { party: 'X', title: 'Scan', kind: 'wahlprogramm', election: '', sourceUrl: '' });
  await assert.rejects(ingestProgramPdf({ db }, empty.id, await makePdf([[]])), /keinen auslesbaren Text/);
  assert.equal((await db.one('select status from programs where id = $1', [empty.id])).status, 'error');

  const notPdf = await createProgram(db, { party: 'Y', title: 'HTML', kind: 'wahlprogramm', election: '', sourceUrl: '' });
  await assert.rejects(ingestProgramPdf({ db }, notPdf.id, Buffer.from('<html>')), /kein PDF/);
  await db.close();
});

test('slugs stay unique', async () => {
  const db = await makeDb();
  const meta = { party: 'SPD', title: 'Programm', kind: 'wahlprogramm', election: 'BTW 2025', sourceUrl: '' };
  assert.equal((await createProgram(db, meta)).slug, 'spd-btw-2025');
  assert.equal((await createProgram(db, meta)).slug, 'spd-btw-2025-2');
  await db.close();
});

test('German full-text search finds inflected forms per programme', async () => {
  const db = await makeDb();
  const lib = await library(db);
  // Plural and inflection: "Mietpreisbremsen" finds "Mietpreisbremse".
  const hits = await searchLibrary(db, 'Mietpreisbremsen verlängern');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].party, 'SPD');
  assert.equal(hits[0].page, 2);
  assert.match(hits[0].snippet, /⟦Mietpreisbremse⟧/);

  const onlyUnion = await searchLibrary(db, 'Mieten', { programId: lib['CDU/CSU'].id });
  assert.ok(onlyUnion.every((h) => h.party === 'CDU/CSU'));
  assert.deepEqual(await searchLibrary(db, '   '), []);

  const passages = await retrievePassages(db, { programIds: [lib.SPD.id, lib['CDU/CSU'].id], queries: ['Mietpreisbremse', 'Mieten', 'bezahlbar'], perProgram: 2 });
  assert.equal(passages.get(lib.SPD.id)[0].page, 2);
  assert.equal(passages.get(lib['CDU/CSU'].id)[0].page, 2, 'each programme gets its own best passage');
  await db.close();
});

test('embeddings, when configured, are stored and fused with full-text results', async () => {
  const db = await makeDb();
  // A fake embedder: one dimension per topic word.
  const topics = ['miet', 'essen', 'bau'];
  const vec = (t) => topics.map((w) => (t.toLowerCase().includes(w) ? 1 : 0.01));
  const embedder = { model: 'fake-embed', embed: async (texts) => texts.map(vec) };
  const lib = await library(db, embedder);
  const stored = await db.one('select embedding from program_chunks where program_id = $1 and page = 3', [lib.SPD.id]);
  assert.equal(stored.embedding.length, 3);

  const { loadVectors } = await import('../src/retrieval.js');
  const vectors = await loadVectors(db, [lib.SPD.id]);
  // No full-text query matches, so only the vector side can find the school lunch.
  const passages = await retrievePassages(db, { programIds: [lib.SPD.id], queries: ['Verpflegung'], queryVector: vec('Schulessen'), vectors, perProgram: 1 });
  assert.equal(passages.get(lib.SPD.id)[0].page, 3);
  await db.close();
});

test('reciprocal rank fusion rewards agreement', () => {
  const fused = rrf([
    [{ id: 1 }, { id: 2 }, { id: 3 }],
    [{ id: 2 }, { id: 3 }],
  ]);
  assert.deepEqual(fused.map((x) => x.id), [2, 3, 1], 'found by both beats first in one');
});

test('search queries are cleaned', () => {
  assert.deepEqual(cleanQueries(['Miete!', 'miete', 'ab', '  Wohnen   bauen ', 'x'.repeat(200)]).map((q) => q.length <= 80), [true, true, true]);
  assert.deepEqual(cleanQueries(['Miete!', 'miete', 'ab']), ['Miete']);
});

test('programme metadata and page links', () => {
  assert.equal(validateProgramMeta({ party: '', title: '' }).errors.length, 2);
  assert.equal(validateProgramMeta({ party: 'A', title: 'B', sourceUrl: 'ftp://x' }).errors.length, 1);
  assert.equal(validateProgramMeta({ party: 'A', title: 'B', kind: 'unsinn' }).meta.kind, 'wahlprogramm');
  assert.equal(pdfPageUrl('https://x.de/a.pdf#page=3', 42), 'https://x.de/a.pdf#page=42');
  assert.equal(pdfPageUrl('', 42), '');
});
