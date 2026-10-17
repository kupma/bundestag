// Text plumbing shared by the article pipeline, the preview and the views.

// --- text ----------------------------------------------------------------------

export function truncate(s, n) {
  const str = String(s || '');
  if (str.length <= n) return str;
  const cut = str.slice(0, n);
  const space = cut.lastIndexOf(' ');
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).trimEnd()} …`;
}

// --- dates -------------------------------------------------------------------
// The Bundestag sits in Berlin, and a sitting day is a Berlin calendar day, so
// every "today" in this app is Berlin's.

const TZ = 'Europe/Berlin';

export function berlinDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function berlinHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(date));
}

export function isYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
}

export function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "Donnerstag, 24. September 2026". Noon UTC is the same calendar day in
// Berlin in every season, so no time zone arithmetic can move it.
export function formatDateDe(ymd, { weekday = true } = {}) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'UTC',
    weekday: weekday ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeDe(date) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
