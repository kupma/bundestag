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
    // Only an address set by hand is the site's one true address: requests to
    // the Railway address (or www.) are then sent there, so search engines see
    // every page once.
    canonicalHost: env.BASE_URL ? new URL(baseUrl).host : '',
    secureCookies: baseUrl.startsWith('https://'),
    siteName: env.SITE_NAME || 'Wahlwort',

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
    // A sitting day this many days back counts as complete regardless.
    settleDays: int(env.ARTICLE_SETTLE_DAYS, 2),
    // The first article about a sitting day is written this many days after
    // it at the latest (from ARTICLE_EARLIEST_HOUR on), even while DIP is still
    // adding to it; later additions rewrite the article (see settleDays).
    writeAfterDays: int(env.ARTICLE_WRITE_AFTER_DAYS, 1),
    // How far the very first run looks back, so a fresh site starts with the
    // most recent sitting week instead of an empty page.
    backfillDays: int(env.BACKFILL_DAYS, 28),
    earliestHour: int(env.ARTICLE_EARLIEST_HOUR, 6),
    maxDecisions: int(env.ARTICLE_MAX_DECISIONS, 8),
    mailMaxAgeDays: int(env.MAIL_MAX_AGE_DAYS, 3),

    // Search engines and statistics, all optional.
    seo: {
      googleVerification: (env.GOOGLE_SITE_VERIFICATION || '').trim(),
      bingVerification: (env.BING_SITE_VERIFICATION || '').trim(),
      // IndexNow tells Bing, Yandex, Seznam & Co. about a new article at once.
      indexNowKey: /^[a-zA-Z0-9-]{8,128}$/.test(env.INDEXNOW_KEY || '') ? env.INDEXNOW_KEY : '',
    },
    // The built-in statistics (/admin/statistik) always run; Plausible is an
    // optional second view (cookieless as well), e.g. PLAUSIBLE_DOMAIN=example.de.
    plausible: {
      domain: (env.PLAUSIBLE_DOMAIN || '').trim(),
      src: (env.PLAUSIBLE_SRC || 'https://plausible.io/js/script.js').trim(),
    },

    imprint: {
      name: env.IMPRINT_NAME || '',
      address: env.IMPRINT_ADDRESS || '',
      email: env.IMPRINT_EMAIL || '',
    },
  };
}
