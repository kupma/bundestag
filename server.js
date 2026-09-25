// Entry point, on Railway and on a laptop alike: read the configuration, open
// and migrate the database, wire up the outside services that are configured,
// serve HTTP, and start the clock.

import http from 'node:http';

import { createApp } from './src/app.js';
import { buildContext } from './src/context.js';
import { startScheduler } from './src/scheduler.js';

async function main() {
  const ctx = await buildContext();
  const { config } = ctx;

  const missing = [];
  if (!config.databaseUrl) console.warn('[boot] DATABASE_URL fehlt – nutze lokale PGlite-Datenbank in', config.pgliteDir, '(nicht für Railway geeignet).');
  if (!ctx.dip) missing.push('DIP_API_KEY (Beschlüsse)');
  if (!ctx.claude) missing.push('ANTHROPIC_API_KEY (Artikel)');
  if (!ctx.mailer.configured) missing.push('MAIL_API_KEY + MAIL_FROM (Newsletter, Bestätigungsmails)');
  if (missing.length) console.warn(`[boot] Nicht konfiguriert: ${missing.join(', ')}`);
  if (!config.adminEmails.length) console.warn('[boot] ADMIN_EMAILS ist leer – niemand kommt in den Admin-Bereich.');

  const server = http.createServer(createApp(ctx));
  server.listen(config.port, () => console.log(`[boot] ${config.siteName} läuft auf Port ${config.port} (${config.baseUrl})`));

  const stopScheduler = config.scheduler ? startScheduler(ctx) : () => {};

  const shutdown = (signal) => {
    console.log(`[boot] ${signal}, fahre herunter …`);
    stopScheduler();
    server.close(() => ctx.db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[boot] Start fehlgeschlagen:', err);
  process.exit(1);
});
