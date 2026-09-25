// Fills the library with the standard programmes (src/program-sources.js) by
// itself: on the first tick after a deploy, and again for anything that is
// still missing on later ticks. A programme that is already imported is never
// downloaded again.

import { recentFailures, runJob } from './jobs.js';
import { DEFAULT_PROGRAMS, NOT_THE_FULL_VERSION } from './program-sources.js';
import { createProgram, downloadPdf, extractPages, ingestProgramPdf, partyClass } from './programs.js';
import { cleanPageText, normalizeForMatch } from './text.js';

const LIBRARY_LOCK = 7243003;
const MAX_FAILURES_PER_DAY = 3;

export function onDomains(url, domains) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

// Is this really the full programme? Long enough to not be a short version,
// real text rather than a scan, and it names itself somewhere.
export function checkProgramPdf(pages, src) {
  if (pages.length < src.minPages) {
    throw new Error(`nur ${pages.length} Seiten – vermutlich nicht die Langfassung (erwartet mindestens ${src.minPages})`);
  }
  const text = normalizeForMatch(pages.map(cleanPageText).join(' '));
  if (text.replace(/\s/g, '').length < pages.length * 150) throw new Error('kaum auslesbarer Text – ist das PDF ein Scan?');
  if (!src.expect.some((w) => text.includes(normalizeForMatch(w)))) {
    throw new Error(`der erwartete Titel („${src.title}“) kommt im Text nicht vor`);
  }
}

async function tryUrl(ctx, src, url, log) {
  try {
    const bytes = await downloadPdf(url, { fetch: ctx.fetch });
    const pages = await extractPages(bytes);
    checkProgramPdf(pages, src);
    return { url, bytes, pages };
  } catch (err) {
    log(`${url}: ${err.message}`);
    return null;
  }
}

export async function findProgramPdf(ctx, src, log = () => {}) {
  const tried = new Set();
  for (const url of src.urls) {
    tried.add(url);
    const hit = await tryUrl(ctx, src, url, log);
    if (hit) return hit;
  }

  if (ctx.claude && ctx.claude.findUrls) {
    log('Keine hinterlegte Adresse passt – Claude sucht die aktuelle Datei auf den offiziellen Seiten.');
    const urls = await ctx.claude.findUrls({
      domains: src.domains,
      prompt:
        `Finde die direkte Adresse (URL) der PDF-Datei mit der vollständigen Fassung von „${src.title}“ ` +
        `(${src.party}, ${src.election}) auf der offiziellen Website. Nicht die Kurzfassung, nicht die Fassung in ` +
        'Leichter Sprache, keinen Entwurf. Antworte nur mit der URL.',
    });
    const candidates = urls.filter(
      (u) => !tried.has(u) && onDomains(u, src.domains) && /\.pdf(?:$|[?#])/i.test(u) && !NOT_THE_FULL_VERSION.test(safeDecode(u)),
    );
    log(`${candidates.length} passende Treffer: ${candidates.join(', ') || '–'}`);
    for (const url of candidates.slice(0, 5)) {
      const hit = await tryUrl(ctx, src, url, log);
      if (hit) return hit;
    }
  }
  throw new Error(`Kein passendes PDF für „${src.title}“ (${src.party}) gefunden.`);
}

function safeDecode(u) {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
}

async function importOne(ctx, src, log) {
  const { db } = ctx;
  const found = await findProgramPdf(ctx, src, log);
  log(`${found.url}: ${found.pages.length} Seiten`);
  const meta = { party: src.party, title: src.title, kind: src.kind, election: src.election, sourceUrl: found.url, sourceKey: src.key };
  const existing = await db.one('select id from programs where source_key = $1', [src.key]);
  let programId;
  if (existing) {
    programId = existing.id;
    await db.query(
      `update programs set party = $2, title = $3, kind = $4, election = $5, source_url = $6, status = 'processing', error = null where id = $1`,
      [programId, meta.party, meta.title, meta.kind, meta.election, meta.sourceUrl],
    );
  } else {
    programId = (await createProgram(db, meta)).id;
  }
  return ingestProgramPdf({ db, embedder: ctx.embedder, log }, programId, found.bytes, { pages: found.pages });
}

// Which standard programmes are there, and in what state – for the admin page.
export async function libraryStatus(db, sources = DEFAULT_PROGRAMS) {
  const { rows } = await db.query(
    `select id, slug, source_key, status, error, page_count, source_url from programs where source_key = any($1::text[])`,
    [sources.map((s) => s.key)],
  );
  const byKey = new Map(rows.map((r) => [r.source_key, r]));
  return sources.map((s) => ({ ...s, program: byKey.get(s.key) || null }));
}

// `force` retries sources that failed three times today; a programme that is
// ready is never imported again either way.
export async function importDefaultPrograms(ctx, { sources = DEFAULT_PROGRAMS, force = false } = {}) {
  const { db } = ctx;
  const outcome = await db.tryLock(LIBRARY_LOCK, async () => {
    const report = { imported: [], adopted: [], failed: [], skipped: [] };
    const { rows: manual } = await db.query(`select id, party, kind from programs where source_key is null and status = 'ready'`);
    for (const src of sources) {
      const existing = await db.one('select status from programs where source_key = $1', [src.key]);
      if (existing && existing.status === 'ready') continue;
      // Somebody already imported this party's document by hand: adopt it
      // rather than putting the same party into every comparison twice.
      const adopt = !existing && manual.find((m) => m.kind === src.kind && partyClass(m.party) === partyClass(src.party) && partyClass(src.party) !== 'p-other');
      if (adopt) {
        await db.query('update programs set source_key = $2 where id = $1', [adopt.id, src.key]);
        manual.splice(manual.indexOf(adopt), 1);
        report.adopted.push(src.key);
        continue;
      }
      if (!force && (await recentFailures(db, `programm:${src.key}`, 24)) >= MAX_FAILURES_PER_DAY) {
        report.skipped.push(src.key);
        continue;
      }
      try {
        await runJob(db, `programm:${src.key}`, (log) => importOne(ctx, src, log));
        report.imported.push(src.key);
      } catch (err) {
        report.failed.push({ key: src.key, error: err.message });
      }
    }
    return report;
  });
  return outcome.ran ? outcome.result : { imported: [], adopted: [], failed: [], skipped: [], busy: true };
}
