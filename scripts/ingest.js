// Import an election programme from the command line, e.g. against the
// Railway database with `railway run npm run ingest -- …`:
//
//   npm run ingest -- --defaults     all standard programmes (see src/program-sources.js)
//
//   npm run ingest -- --party "SPD" --title "Regierungsprogramm 2025" \
//     --election "Bundestagswahl 2025" --url https://example.org/programm.pdf
//
//   npm run ingest -- --party "Grüne" --title "Wahlprogramm 2025" \
//     --file ./gruene.pdf --url https://example.org/gruene.pdf
//
// --kind is wahlprogramm (default), koalitionsvertrag or sonstiges. With
// --file the PDF is read from disk and --url is only used for the links to
// the original.

import fs from 'node:fs/promises';
import { buildContext } from '../src/context.js';
import { importDefaultPrograms } from '../src/default-library.js';
import { createProgram, downloadPdf, ingestProgramPdf, validateProgramMeta } from '../src/programs.js';

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

const a = args(process.argv.slice(2));

// The standard library: every Bundestag party's programme and the coalition
// agreement, downloaded from the official sites and checked.
if (a.defaults) {
  const ctx = await buildContext();
  try {
    const report = await importDefaultPrograms(ctx, { force: true });
    console.log(`Importiert: ${report.imported.join(', ') || '–'}`);
    for (const f of report.failed) console.log(`Fehlgeschlagen: ${f.key} – ${f.error}`);
    if (report.failed.length) process.exitCode = 1;
  } finally {
    await ctx.db.close();
  }
  process.exit();
}

const { errors, meta } = validateProgramMeta({ party: a.party, title: a.title, kind: a.kind, election: a.election, sourceUrl: a.url });
if (!a.file && !meta.sourceUrl) errors.push('--url oder --file angeben.');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const ctx = await buildContext();
try {
  const bytes = a.file ? await fs.readFile(a.file) : await downloadPdf(meta.sourceUrl);
  const program = await createProgram(ctx.db, meta);
  const result = await ingestProgramPdf({ db: ctx.db, embedder: ctx.embedder, log: (l) => console.log(l) }, program.id, bytes);
  console.log(`Fertig: /programme/${program.slug} – ${result.pages} Seiten, ${result.chunks} Passagen`);
} catch (err) {
  console.error('Import fehlgeschlagen:', err.message);
  process.exitCode = 1;
} finally {
  await ctx.db.close();
}
