// Finding the passages of each programme that speak to a decision.
//
// Two retrievers, fused per programme with reciprocal rank fusion:
//   1. Postgres full-text search with the German stemmer, over search queries
//      Claude writes for the decision (it knows that a "Gebäudeenergiegesetz"
//      is what programmes call "Heizungsgesetz"), and
//   2. cosine similarity over Voyage embeddings, when they exist.
// Every programme is searched separately, so each party gets its own best
// passages instead of the loudest programme taking every slot.

import { cosine } from './embeddings.js';

export function buildOrQuery(queries, firstParam) {
  return queries.map((_, i) => `websearch_to_tsquery('german', $${firstParam + i})`).join(' || ');
}

export function cleanQueries(queries) {
  const seen = new Set();
  const out = [];
  for (const q of queries || []) {
    const s = String(q || '')
      .replace(/[^\p{L}\p{N}\s\-"]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (s.length < 3 || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out.slice(0, 12);
}

export async function ftsCandidates(db, programIds, queries, perProgram) {
  const qs = cleanQueries(queries);
  if (!qs.length || !programIds.length) return [];
  const { rows } = await db.query(
    `with q as (select (${buildOrQuery(qs, 3)}) as q)
     select id, program_id, page, text, rank from (
       select c.id, c.program_id, c.page, c.text, ts_rank_cd(c.tsv, q.q, 32) as rank,
              row_number() over (partition by c.program_id order by ts_rank_cd(c.tsv, q.q, 32) desc, c.id) as rn
         from program_chunks c, q
        where c.program_id = any($1::int[]) and c.tsv @@ q.q
     ) r
     where rn <= $2
     order by program_id, rank desc`,
    [programIds, perProgram, ...qs],
  );
  return rows;
}

// Loaded once per article run; a few thousand vectors fit comfortably in memory.
export async function loadVectors(db, programIds) {
  const { rows } = await db.query(
    `select id, program_id, page, text, embedding from program_chunks
      where program_id = any($1::int[]) and embedding is not null`,
    [programIds],
  );
  const byProgram = new Map();
  for (const r of rows) {
    if (!byProgram.has(r.program_id)) byProgram.set(r.program_id, []);
    byProgram.get(r.program_id).push(r);
  }
  return byProgram;
}

export function rrf(lists, k = 60) {
  const scores = new Map();
  const items = new Map();
  for (const list of lists) {
    list.forEach((item, rank) => {
      scores.set(item.id, (scores.get(item.id) || 0) + 1 / (k + rank + 1));
      if (!items.has(item.id)) items.set(item.id, item);
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id, score]) => ({ ...items.get(id), score }));
}

export async function retrievePassages(db, { programIds, queries, queryVector = null, vectors = null, perProgram = 5, candidates = 15 }) {
  const fts = await ftsCandidates(db, programIds, queries, candidates);
  const result = new Map(programIds.map((id) => [id, []]));
  for (const pid of programIds) {
    const lists = [fts.filter((r) => r.program_id === pid)];
    if (queryVector && vectors && vectors.has(pid)) {
      const scored = vectors
        .get(pid)
        .map((r) => ({ id: r.id, program_id: r.program_id, page: r.page, text: r.text, sim: cosine(queryVector, r.embedding) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, candidates);
      lists.push(scored);
    }
    result.set(
      pid,
      rrf(lists)
        .slice(0, perProgram)
        .map(({ id, page, text, score }) => ({ id, page, text, score })),
    );
  }
  return result;
}

// Reader-facing search over the whole library (or one programme).
// ts_headline marks the hits with ⟦ ⟧, which the view turns into <mark>
// after escaping, so the passage text itself can never become markup.
export async function searchLibrary(db, q, { programId = null, limit = 20, offset = 0 } = {}) {
  const query = String(q || '').trim().slice(0, 200);
  if (!query) return [];
  const { rows } = await db.query(
    `select c.id, c.page, p.id as program_id, p.party, p.title, p.slug, p.kind, p.source_url,
            ts_headline('german', c.text, q.q, 'StartSel=⟦, StopSel=⟧, MaxWords=45, MinWords=18, MaxFragments=2, FragmentDelimiter=" … "') as snippet,
            ts_rank_cd(c.tsv, q.q, 32) as rank
       from program_chunks c
       join programs p on p.id = c.program_id,
            websearch_to_tsquery('german', $1) as q(q)
      where c.tsv @@ q.q and p.status = 'ready' and ($2::int is null or p.id = $2::int)
      order by rank desc, c.id
      limit $3 offset $4`,
    [query, programId, limit, offset],
  );
  return rows;
}
