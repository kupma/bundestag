// Write (or rewrite) the article for one sitting day by hand:
//
//   npm run generate -- 2026-09-24            fetch that day from DIP, then write
//   npm run generate -- 2026-09-24 --force    rewrite an existing article
//   npm run generate -- 2026-09-24 --mail     and send the newsletter afterwards

import { generateArticle } from '../src/articles.js';
import { buildContext } from '../src/context.js';
import { syncDecisions } from '../src/dip.js';
import { runJob } from '../src/jobs.js';
import { mailArticle } from '../src/newsletter.js';
import { isYmd } from '../src/text.js';

const argv = process.argv.slice(2);
const date = argv.find(isYmd);
if (!date) {
  console.error('Datum angeben, z. B.: npm run generate -- 2026-09-24');
  process.exit(1);
}

const ctx = await buildContext();
try {
  if (ctx.dip) {
    const r = await syncDecisions(ctx, { start: date, end: date });
    console.log(`DIP: ${r.decisions} Beschlüsse (${r.inserted} neu, ${r.changed} geändert)`);
  }
  const result = await runJob(ctx.db, `article:${date}`, (log) => generateArticle(ctx, date, { force: argv.includes('--force'), log }));
  if (result.skipped) console.log(`Artikel existiert schon (--force zum Neuschreiben): /artikel/${date}`);
  else console.log(`Fertig: ${ctx.config.baseUrl}/artikel/${result.slug}`);
  if (argv.includes('--mail') && result.articleId) await mailArticle(ctx, result.articleId, { log: console.log });
} catch (err) {
  console.error('Fehlgeschlagen:', err.message);
  process.exitCode = 1;
} finally {
  await ctx.db.close();
}
