// Everything the app reads from the environment, in one place. Nothing else
// touches process.env, so a test can build a config by hand and know it has
// seen every knob there is.

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const list = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function loadConfig(env = process.env) {
  const port = int(env.PORT, 3000);
  // Railway sets RAILWAY_PUBLIC_DOMAIN once a domain is generated for the
  // service, so a fresh deploy gets working links in its emails without
  // anybody having to copy the address into BASE_URL by hand.
  const baseUrl = (
    env.BASE_URL ||
    (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${port}`)
  ).replace(/\/+$/, '');

  return {
    port,
    baseUrl,
    secureCookies: baseUrl.startsWith('https://'),
    siteName: env.SITE_NAME || 'Versprochen & Beschlossen',

    // Postgres on Railway. Without it the app falls back to an embedded
    // Postgres (PGlite) in PGLITE_DIR, which is for local development only.
    databaseUrl: env.DATABASE_URL || '',
    pgliteDir: env.PGLITE_DIR || '.data/pglite',

    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    claudeModel: env.CLAUDE_MODEL || 'claude-opus-5',

    dipApiKey: env.DIP_API_KEY || '',
    dipBaseUrl: (env.DIP_BASE_URL || 'https://search.dip.bundestag.de/api/v1').replace(/\/+$/, ''),

    // Optional: semantic search on top of the German full-text search.
    voyageApiKey: env.VOYAGE_API_KEY || '',
    voyageModel: env.VOYAGE_MODEL || 'voyage-3.5',

    mail: {
      apiKey: (env.MAIL_API_KEY || '').trim(),
      from: (env.MAIL_FROM || '').trim(),
      replyTo: (env.MAIL_REPLY_TO || env.IMPRINT_EMAIL || '').trim(),
      baseUrl: (env.MAIL_BASE_URL || 'https://api.resend.com').replace(/\/+$/, ''),
    },

    adminEmails: list(env.ADMIN_EMAILS),

    scheduler: env.SCHEDULER !== 'off',
    // Download the election programmes of the Bundestag parties by itself.
    defaultLibrary: env.DEFAULT_LIBRARY !== 'off',
    cronSecret: env.CRON_SECRET || '',
    lookbackDays: int(env.DIP_LOOKBACK_DAYS, 10),
    settleHours: int(env.ARTICLE_SETTLE_HOURS, 12),
    earliestHour: int(env.ARTICLE_EARLIEST_HOUR, 6),
    maxDecisions: int(env.ARTICLE_MAX_DECISIONS, 8),
    mailMaxAgeDays: int(env.MAIL_MAX_AGE_DAYS, 3),

    imprint: {
      name: env.IMPRINT_NAME || '',
      address: env.IMPRINT_ADDRESS || '',
      email: env.IMPRINT_EMAIL || '',
    },
  };
}
