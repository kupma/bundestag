// Text plumbing shared by the PDF library, the article pipeline and the views.

// --- PDF page text -----------------------------------------------------------

// What comes out of a PDF is typeset text: words split across lines with a
// hyphen, soft hyphens, runs of spaces from justified columns. This undoes
// the typesetting without touching the words.
export function cleanPageText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/­/g, '')
    .replace(/[   ]/g, ' ')
    // "Mieterin-\nnen" -> "Mieterinnen", but "CDU-\nGeschäftsstelle" keeps its hyphen.
    .replace(/(\p{L})-[ \t]*\n[ \t]*(\p{Ll})/gu, '$1$2')
    .replace(/(\p{L})-[ \t]*\n[ \t]*(\p{Lu})/gu, '$1-$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Sentence split that survives German abbreviations well enough for chunking.
// It only has to find *reasonable* places to cut, never all of them.
const ABBREV = /(?:\b(?:z|u|d|s|v|bzw|ca|vgl|ggf|inkl|Nr|Abs|Art|Mio|Mrd|Dr|Prof|etc|usw|u\.a|z\.B|d\.h|sog|insb|bspw)\.)$/i;

export function splitSentences(text) {
  const parts = [];
  let start = 0;
  const re = /[.!?…]["»«”“)]*\s+(?=[\p{Lu}\d„"»(•–-])/gu;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const candidate = text.slice(start, end);
    if (ABBREV.test(candidate.trimEnd())) continue;
    parts.push(candidate.trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

// Cuts one page into passages of roughly `target` characters along paragraph
// and sentence boundaries. Passages never span pages, so a citation always
// points at exactly one page.
export function chunkPage(text, { target = 900, max = 1400, min = 60 } = {}) {
  const paragraphs = String(text || '')
    .split(/\n{2,}|\n(?=[•\-–]\s)|\n(?=\d+\.\s)/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

  const pieces = [];
  for (const p of paragraphs) {
    if (p.length <= max) {
      pieces.push(p);
      continue;
    }
    let buf = '';
    for (const s of splitSentences(p)) {
      if (s.length > max) {
        if (buf) pieces.push(buf), (buf = '');
        for (let i = 0; i < s.length; i += max) pieces.push(s.slice(i, i + max));
        continue;
      }
      if (buf && buf.length + 1 + s.length > max) pieces.push(buf), (buf = '');
      buf = buf ? `${buf} ${s}` : s;
    }
    if (buf) pieces.push(buf);
  }

  const chunks = [];
  let buf = '';
  for (const piece of pieces) {
    if (buf && buf.length + 2 + piece.length > max) {
      chunks.push(buf);
      buf = '';
    }
    buf = buf ? `${buf}\n\n${piece}` : piece;
    if (buf.length >= target) {
      chunks.push(buf);
      buf = '';
    }
  }
  if (buf) {
    // A short tail (a heading, a page footer) joins the passage before it
    // rather than becoming a passage of its own.
    if (buf.length < min && chunks.length && chunks[chunks.length - 1].length + buf.length + 2 <= max * 1.2) {
      chunks[chunks.length - 1] += `\n\n${buf}`;
    } else {
      chunks.push(buf);
    }
  }
  // A page that is only a page number or a running header is not a passage.
  return chunks.filter((c) => c.replace(/[\s\d.\-–|]/g, '').length >= 20);
}

// For checking that a quote the model returned really is in the passage it
// cites: case, whitespace, quote marks and dashes are allowed to differ.
export function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[„“”"»«‚‘’']/g, '')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/­/g, '')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

export function quoteIsIn(quote, passage) {
  const q = normalizeForMatch(quote).replace(/^\.\.\.\s*|\s*\.\.\.$/g, '');
  if (q.length < 8) return false;
  const p = normalizeForMatch(passage);
  // A quote the model shortened with an ellipsis in the middle is still a
  // quote as long as every piece of it is in the passage, in order.
  let from = 0;
  for (const part of q.split(/\s*\.\.\.\s*|\s*\[…\]\s*/).filter(Boolean)) {
    const at = p.indexOf(part, from);
    if (at === -1) return false;
    from = at + part.length;
  }
  return true;
}

export function truncate(s, n) {
  const str = String(s || '');
  if (str.length <= n) return str;
  const cut = str.slice(0, n);
  const space = cut.lastIndexOf(' ');
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).trimEnd()} …`;
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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
