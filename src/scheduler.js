// The clock. Every quarter of an hour: fetch new decisions from DIP (at most
// hourly), write the article for one finished sitting day, and send the
// newsletter for articles that have not gone out yet. Each step is idempotent,
// so a tick that runs twice, late, or on two replicas at once does no harm;
// the advisory lock just saves the second one the work.

import { generateArticle, pendingDates, readyPrograms } from './articles.js';
import { syncDecisions } from './dip.js';
import { recentFailures, runJob } from './jobs.js';
import { mailArticle } from './newsletter.js';
import { addDays, berlinDate, berlinHour } from './text.js';

const TICK_LOCK = 7243002;
const TICK_EVERY_MS = 15 * 60 * 1000;
const SYNC_EVERY_MS = 55 * 60 * 1000;
const MAX_FAILURES_PER_DAY = 3;

const state = { lastSync: 0 };

export async function tick(ctx, { now = new Date(), forceSync = false } = {}) {
  const { db, config } = ctx;
  const outcome = await db.tryLock(TICK_LOCK, async () => {
    const report = { sync: null, generated: [], mailed: [], notes: [] };
    const today = berlinDate(now);
    const from = addDays(today, -config.lookbackDays);
    const hour = berlinHour(now);

    // 1. new decisions
    if (!ctx.dip) report.notes.push('DIP_API_KEY fehlt – keine Beschlüsse abrufbar.');
    else if (forceSync || now.getTime() - state.lastSync > SYNC_EVERY_MS) {
      state.lastSync = now.getTime();
      try {
        report.sync = await runJob(db, 'dip-sync', async (log) => {
          const r = await syncDecisions(ctx, { start: from, end: today });
          log(`${from} bis ${today}: ${r.positions} Positionen, ${r.decisions} Beschlüsse (${r.inserted} neu, ${r.changed} geändert)`);
          return r;
        });
      } catch (err) {
        report.notes.push(`DIP: ${err.message}`);
      }
    }

    // 2. one article per tick – never for today, whose sitting may still run
    if (!ctx.claude) report.notes.push('ANTHROPIC_API_KEY fehlt – keine Artikel.');
    else if (hour >= config.earliestHour) {
      const programs = await readyPrograms(db);
      const dates = programs.length ? await pendingDates(db, { from, to: addDays(today, -1), settleHours: config.settleHours }) : [];
      if (!programs.length) report.notes.push('Die Bibliothek ist leer – bitte Wahlprogramme importieren.');
      for (const date of dates) {
        if ((await recentFailures(db, `article:${date}`, 24)) >= MAX_FAILURES_PER_DAY) continue;
        try {
          const r = await runJob(db, `article:${date}`, (log) => generateArticle(ctx, date, { log }));
          report.generated.push({ date, slug: r.slug });
        } catch (err) {
          report.notes.push(`Artikel ${date}: ${err.message}`);
        }
        break;
      }
    }

    // 3. letters, in waking hours only
    if (ctx.mailer.configured && hour >= config.earliestHour && hour < 21) {
      const { rows } = await db.query(
        `select id, sitting_date from articles
          where status = 'published' and mailed_at is null and sitting_date >= $1
          order by sitting_date`,
        [addDays(today, -config.mailMaxAgeDays)],
      );
      for (const a of rows) {
        try {
          const r = await runJob(db, 'newsletter', (log) => mailArticle(ctx, a.id, { log }));
          report.mailed.push({ date: a.sitting_date, ...r });
        } catch (err) {
          report.notes.push(`Newsletter ${a.sitting_date}: ${err.message}`);
        }
      }
    }
    return report;
  });
  return outcome.ran ? outcome.result : { skipped: 'läuft bereits' };
}

export function startScheduler(ctx) {
  const run = () =>
    tick(ctx).catch((err) => {
      console.error('[tick]', err);
    });
  const first = setTimeout(run, 20000);
  const timer = setInterval(run, TICK_EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
