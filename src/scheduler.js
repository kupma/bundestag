// The clock. Every quarter of an hour: import any standard programme that is
// still missing, fetch new decisions from DIP (at most hourly), write the
// article for one finished sitting day (or refresh one that DIP has added to
// since), and send the newsletter for articles that have not gone out yet. Each step is idempotent,
// so a tick that runs twice, late, or on two replicas at once does no harm;
// the advisory lock just saves the second one the work.

import { pruneTraffic } from './analytics.js';
import { generateArticle, pendingDates, readyPrograms, refreshCandidates } from './articles.js';
import { importDefaultPrograms } from './default-library.js';
import { syncDecisions } from './dip.js';
import { recentFailures, runJob } from './jobs.js';
import { mailArticle } from './newsletter.js';
import { pingIndexNow } from './seo.js';
import { addDays, berlinDate, berlinHour } from './text.js';

const TICK_LOCK = 7243002;
const TICK_EVERY_MS = 15 * 60 * 1000;
const SYNC_EVERY_MS = 55 * 60 * 1000;
const MAX_FAILURES_PER_DAY = 3;

const state = { lastSync: 0 };

export async function tick(ctx, { now = new Date(), forceSync = false } = {}) {
  const { db, config } = ctx;
  const outcome = await db.tryLock(TICK_LOCK, async () => {
    const report = { sync: null, library: null, generated: [], refreshed: [], mailed: [], notes: [] };
    const today = berlinDate(now);
    const hour = berlinHour(now);
    // Until the first article exists, look back far enough to find the most
    // recent sitting week, so a fresh site does not stay empty until the next.
    const firstRun = !(await db.one('select 1 as x from articles limit 1'));
    const from = addDays(today, -(firstRun ? Math.max(config.lookbackDays, config.backfillDays) : config.lookbackDays));
    const settle = { settleHours: config.settleHours, settledBefore: addDays(today, -config.settleDays) };

    // 0. the standard library – a no-op once everything is imported
    if (config.defaultLibrary) {
      const lib = await importDefaultPrograms(ctx, ctx.librarySources ? { sources: ctx.librarySources } : {});
      if (lib.imported.length || lib.failed.length) report.library = lib;
      for (const f of lib.failed) report.notes.push(`Bibliothek ${f.key}: ${f.error}`);
    }

    // 1. new decisions
    let synced = false;
    if (!ctx.dip) report.notes.push('DIP_API_KEY fehlt – keine Beschlüsse abrufbar.');
    else if (forceSync || now.getTime() - state.lastSync > SYNC_EVERY_MS) {
      state.lastSync = now.getTime();
      try {
        report.sync = await runJob(db, 'dip-sync', async (log) => {
          const r = await syncDecisions(ctx, { start: from, end: today });
          log(`${from} bis ${today}: ${r.positions} Positionen, ${r.decisions} Beschlüsse (${r.inserted} neu, ${r.changed} geändert)`);
          return r;
        });
        synced = true;
      } catch (err) {
        report.notes.push(`DIP: ${err.message}`);
      }
    }

    // 2. articles – never for today, whose sitting may still run. One per tick
    // spreads the cost; the first run writes the latest sitting week at once.
    if (!ctx.claude) report.notes.push('ANTHROPIC_API_KEY fehlt – keine Artikel.');
    else if (hour >= config.earliestHour) {
      const programs = await readyPrograms(db);
      if (!programs.length) report.notes.push('Die Bibliothek ist noch leer – die Wahlprogramme werden geladen.');
      // Yesterday's sitting is written the next morning, even if DIP is still
      // documenting it; step 2b rewrites the article as the rest arrives.
      const firstDraft = { ...settle, settledBefore: addDays(today, -config.writeAfterDays) };
      let dates = programs.length ? await pendingDates(db, { from, to: addDays(today, -1), ...firstDraft }) : [];
      if (firstRun && dates.length) {
        const latest = dates[dates.length - 1];
        dates = dates.filter((d) => d >= addDays(latest, -6)).slice(-3);
      }
      const budget = firstRun ? 3 : 1;
      for (const date of dates) {
        if (report.generated.length >= budget) break;
        if ((await recentFailures(db, `article:${date}`, 24)) >= MAX_FAILURES_PER_DAY) continue;
        try {
          const r = await runJob(db, `article:${date}`, (log) => generateArticle(ctx, date, { log }));
          report.generated.push({ date, slug: r.slug });
        } catch (err) {
          report.notes.push(`Artikel ${date}: ${err.message}`);
        }
      }

      // 2b. keep recent articles complete: rewrite one when DIP has added
      // decisions since, or once the plenary protocol (with the votes) is out.
      // Never re-sends the newsletter.
      if (programs.length && !report.generated.length) {
        const { changed, withoutProtocol } = await refreshCandidates(db, { from: addDays(today, -config.lookbackDays), ...settle });
        let due = changed.map((date) => ({ date, why: 'neue Beschlüsse in DIP' }));
        if (!due.length && synced && withoutProtocol.length) {
          for (const date of withoutProtocol.slice(-3)) {
            const protocol = await ctx.dip.protocolText(date).catch(() => null);
            if (protocol && protocol.text) {
              due = [{ date, why: 'Plenarprotokoll jetzt verfügbar' }];
              break;
            }
          }
        }
        for (const { date, why } of due) {
          if ((await recentFailures(db, `article:${date}`, 24)) >= MAX_FAILURES_PER_DAY) continue;
          try {
            const r = await runJob(db, `article:${date}`, (log) => {
              log(`Aktualisierung: ${why}`);
              return generateArticle(ctx, date, { force: true, log });
            });
            report.refreshed.push({ date, why, slug: r && r.slug });
          } catch (err) {
            report.notes.push(`Aktualisierung ${date}: ${err.message}`);
          }
          break;
        }
      }
    }

    // 2c. tell search engines about new and rewritten articles
    const fresh = [...report.generated.map((g) => g.slug), ...report.refreshed.map((r) => r.slug)].filter(Boolean);
    if (fresh.length) await pingIndexNow(ctx, [...fresh.map((slug) => `/artikel/${slug}`), '/', '/archiv']);

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
    // 4. statistics older than about a year are not kept
    if (hour === 3) await pruneTraffic(db).catch(() => {});
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
