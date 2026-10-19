// An article as an Instagram carousel: a cover with the day's title, one
// picture per decision (headline, result, summary, and each group's vote in
// seat order), and a last one that points to the article. 1080 × 1350, the
// tallest format the feed shows, drawn as SVG and turned into a JPEG, the only
// image format Instagram takes.
//
// Same rules as the site: paper, stone and ink, results and votes told apart
// by shape (filled, outlined, dashed, dotted), and a party's colour only in
// its small dot, the same size for every party.
//
// The fonts are static cuts of the site's own (static/fonts/*.ttf), since
// resvg draws a variable font only in its default cut. They were made from
// the woff2 files with fontTools' instancer: Fraunces at wght 560 and SOFT
// 100 (the headings' settings), Figtree at 400 and 600.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import jpeg from 'jpeg-js';

import { escapeHtml } from '../html.js';
import { formatDateDe } from '../text.js';
import { RESULT_LABEL, VOTE_LABEL } from './labels.js';
import { votesOf } from './public.js';
import { HALL } from './shapes.js';

export const W = 1080;
export const H = 1350;
const M = 88;
const INNER = W - 2 * M;
// Instagram's limit for a carousel: the cover, eight decisions, the end.
export const MAX_SLIDES = 10;

// The light palette of static/styles.css, and the parties' dots.
const C = { paper: '#f6f3ee', stone: '#efebe4', stone3: '#d6cec2', ink: '#2b2926', ink2: '#57524b', ink3: '#807970', onInk: '#f6f3ee' };
const PARTY = { Linke: '#be3075', Grüne: '#1aa037', SPD: '#e3000f', 'CDU/CSU': '#2b2926', AfD: '#009ee0' };

// --- fonts and measuring ------------------------------------------------------------

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'static', 'fonts');
const FONTS = {
  display: { file: 'fraunces-soft-560.ttf', family: 'Fraunces', weight: 560 },
  text: { file: 'figtree-400.ttf', family: 'Figtree', weight: 400 },
  bold: { file: 'figtree-600.ttf', family: 'Figtree', weight: 600 },
};

// Advance widths (in em) by code point, straight from a TrueType file: the
// cmap's Unicode subtable (format 4) and hmtx. Enough to wrap a line before
// resvg draws it. Kerning is left out; it mostly tightens a line, so a line
// measured without it does not run over.
export function advanceWidths(buf) {
  const tables = {};
  for (let i = 0; i < buf.readUInt16BE(4); i++) {
    const at = 12 + i * 16;
    tables[buf.toString('latin1', at, at + 4)] = buf.readUInt32BE(at + 8);
  }
  const unitsPerEm = buf.readUInt16BE(tables.head + 18);
  const hMetrics = buf.readUInt16BE(tables.hhea + 34);
  const advance = (glyph) => buf.readUInt16BE(tables.hmtx + 4 * Math.min(glyph, hMetrics - 1)) / unitsPerEm;
  const widths = new Map();
  for (let i = 0; i < buf.readUInt16BE(tables.cmap + 2); i++) {
    const rec = tables.cmap + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const sub = tables.cmap + buf.readUInt32BE(rec + 4);
    if (buf.readUInt16BE(sub) !== 4 || !(platform === 0 || (platform === 3 && buf.readUInt16BE(rec + 2) === 1))) continue;
    const segs = buf.readUInt16BE(sub + 6);
    const ends = sub + 14;
    const starts = ends + segs + 2;
    const deltas = starts + segs;
    const offsets = deltas + segs;
    for (let s = 0; s < segs; s += 2) {
      const start = buf.readUInt16BE(starts + s);
      const delta = buf.readInt16BE(deltas + s);
      const offset = buf.readUInt16BE(offsets + s);
      for (let c = start; c <= buf.readUInt16BE(ends + s) && c !== 0xffff; c++) {
        let glyph = offset ? buf.readUInt16BE(offsets + s + offset + 2 * (c - start)) : c;
        if (glyph) glyph = (glyph + delta) & 0xffff;
        if (glyph) widths.set(c, advance(glyph));
      }
    }
    break;
  }
  return widths;
}

let loaded = null;
export function fonts() {
  if (!loaded) {
    loaded = Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, { ...f, widths: advanceWidths(fs.readFileSync(path.join(FONT_DIR, f.file))) }]));
  }
  return loaded;
}

export const measure = (font, s, size) => [...s].reduce((w, ch) => w + (font.widths.get(ch.codePointAt(0)) ?? 0.6), 0) * size;

// Only what the font can draw: other spaces become spaces, a letter the
// subset lacks goes without its accent or stroke (ń as n, Ł as L; Fraunces
// puts a combining accent in the wrong place), anything else is left out.
const BARE = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ħ: 'H', ħ: 'h' };

export function clean(font, s) {
  let out = '';
  for (const ch of String(s ?? '').normalize('NFC')) {
    if (/\s/.test(ch)) out += ' ';
    else if (font.widths.has(ch.codePointAt(0))) out += ch;
    else out += [...(BARE[ch] || ch.normalize('NFKD'))].filter((c) => !/\p{M}/u.test(c) && font.widths.has(c.codePointAt(0))).join('');
  }
  return out.replace(/ +/g, ' ').trim();
}

// Where a long word may be broken: after one of its own hyphens, or after the
// joining s of a German compound ("Beschaffungs|beschleunigungs|gesetz").
const SEAM = /(?:-|(?:ung|ion|heit|keit|schaft|tät|tum|ling)s)$/;

// Greedy lines no wider than `width`. A word wider than a line is broken, at
// a seam if there is one in its second half; `broken` says so.
function breakLines(font, text, size, width) {
  const fits = (s) => measure(font, s, size) <= width;
  const lines = [];
  let line = '';
  let broken = false;
  for (let word of clean(font, text).split(' ').filter(Boolean)) {
    if (fits(line ? `${line} ${word}` : word)) {
      line = line ? `${line} ${word}` : word;
      continue;
    }
    if (line) lines.push(line);
    while (!fits(word)) {
      broken = true;
      let cut = word.length - 1;
      while (cut > 1 && !fits(`${word.slice(0, cut)}-`)) cut--;
      let at = cut;
      for (let i = cut; i > cut / 2; i--) {
        if (SEAM.test(word.slice(0, i))) {
          at = i;
          break;
        }
      }
      lines.push(word[at - 1] === '-' ? word.slice(0, at) : `${word.slice(0, at)}-`);
      word = word.slice(at);
    }
    line = word;
  }
  if (line) lines.push(line);
  return { lines, broken };
}

export const wrap = (font, text, size, width) => breakLines(font, text, size, width).lines;

// The largest of `sizes` at which the text fits in `maxLines` lines (or in
// `height`, at `leading`), with no word broken if any size allows that. At
// the smallest, the last line ends in "…".
export function fit(font, text, { sizes, width, maxLines = Infinity, height = Infinity, leading = 1.3 }) {
  const limit = (size) => Math.max(1, Math.min(maxLines, Math.floor(height / (size * leading))));
  for (const whole of [true, false]) {
    for (const size of sizes) {
      const { lines, broken } = breakLines(font, text, size, width);
      if (lines.length <= limit(size) && !(whole && broken)) return { size, lines };
    }
  }
  const size = sizes[sizes.length - 1];
  const all = wrap(font, text, size, width);
  const lines = all.slice(0, limit(size));
  let last = lines[lines.length - 1];
  while (last.includes(' ') && measure(font, `${last} …`, size) > width) last = last.replace(/\s*\S+$/, '');
  lines[lines.length - 1] = `${last} …`;
  return { size, lines, cut: true };
}

// --- drawing ----------------------------------------------------------------------

const n1 = (v) => Number(v.toFixed(1));

// One <text> per line; `y` is the top of the block.
function lines(font, list, { x, y, size, leading = 1.3, fill = C.ink, anchor = 'start' }) {
  const lh = size * leading;
  const svg = list
    .map(
      (line, i) =>
        `<text x="${n1(x)}" y="${n1(y + i * lh + (lh - size) / 2 + size * 0.8)}" font-family="${font.family}" font-weight="${font.weight}" font-size="${size}" fill="${fill}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}>${escapeHtml(line)}</text>`,
    )
    .join('');
  return { svg, height: list.length * lh };
}

// Results and votes as on the site: told apart by their outline.
const SHAPES = {
  filled: { fill: C.ink, stroke: C.ink, text: C.onInk },
  outlined: { fill: 'none', stroke: C.ink, text: C.ink },
  dashed: { fill: 'none', stroke: C.ink3, text: C.ink2, dash: '10 7' },
  dotted: { fill: 'none', stroke: C.ink3, text: C.ink2, dash: '0.1 8' },
  settled: { fill: 'none', stroke: C.stone3, text: C.ink2, dash: '10 7' },
  faint: { fill: 'none', stroke: C.stone3, text: C.ink3 },
};
const RESULT_SHAPE = { angenommen: 'filled', abgelehnt: 'outlined', erledigt: 'settled', sonstiges: 'settled' };
const VOTE_SHAPE = { dafür: 'filled', dagegen: 'outlined', enthalten: 'dashed', gespalten: 'dotted', unbekannt: 'faint' };

function pill(font, label, shape, { x, y, size, h, w = null }) {
  const s = SHAPES[shape] || SHAPES.faint;
  const text = clean(font, label);
  const width = w ?? measure(font, text, size) + h * 0.9;
  return {
    svg: `<rect x="${n1(x + 1.5)}" y="${n1(y + 1.5)}" width="${n1(width - 3)}" height="${n1(h - 3)}" rx="${n1((h - 3) / 2)}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="3"${s.dash ? ` stroke-dasharray="${s.dash}" stroke-linecap="round"` : ''}/><text x="${n1(x + width / 2)}" y="${n1(y + h / 2 + size * 0.35)}" font-family="${font.family}" font-weight="${font.weight}" font-size="${size}" fill="${s.text}" text-anchor="middle">${escapeHtml(text)}</text>`,
    width,
  };
}

function header(f, config, date) {
  const name = lines(f.display, [clean(f.display, config.siteName)], { x: M + 76, y: M - 4, size: 38, leading: 1 });
  const day = date ? lines(f.text, [formatDateDe(date, { weekday: false })], { x: W - M, y: M + 4, size: 28, leading: 1, fill: C.ink3, anchor: 'end' }) : { svg: '' };
  return `<g transform="translate(${M} ${M - 10}) scale(1.5)" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round">${HALL}</g>${name.svg}${day.svg}`;
}

const svgOf = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.paper}"/>${body}</svg>`;

function cover(f, config, article, count) {
  const date = formatDateDe(article.sitting_date);
  const eyebrow = fit(f.text, `Sitzung des Bundestags vom ${date}`, { sizes: [32, 30], width: INNER, maxLines: 2, leading: 1.35 });
  const title = fit(f.display, article.title, { sizes: [84, 78, 72, 66, 60, 54], width: INNER, maxLines: 6, leading: 1.12 });
  const lede = fit(f.text, article.lede, { sizes: [38, 36, 34, 32, 30], width: INNER, maxLines: 6, leading: 1.45 });
  const heights = [eyebrow.size * 1.35 * eyebrow.lines.length, 28, title.size * 1.12 * title.lines.length, 40, lede.size * 1.45 * lede.lines.length];
  let y = Math.max(250, (H - heights.reduce((a, b) => a + b, 0)) / 2 - 30);
  const parts = [];
  for (const [i, [font, block, leading, fill]] of [
    [f.text, eyebrow, 1.35, C.ink3],
    [f.display, title, 1.12, C.ink],
    [f.text, lede, 1.45, C.ink2],
  ].entries()) {
    const b = lines(font, block.lines, { x: M, y, size: block.size, leading, fill });
    parts.push(b.svg);
    y += b.height + (i === 0 ? 28 : 40);
  }
  // "Swipe": the number of decisions, and a chevron where the next picture is.
  const more = `${count} ${count === 1 ? 'Beschluss' : 'Beschlüsse'}, verständlich erklärt`;
  const foot = lines(f.bold, [more], { x: M, y: H - M - 44, size: 32, leading: 1.375, fill: C.ink2 });
  const ax = M + measure(f.bold, more, 32) + 22;
  const ay = H - M - 22;
  parts.push(foot.svg, `<path d="M${n1(ax)} ${ay - 12}l12 12-12 12" fill="none" stroke="${C.ink2}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`);
  return svgOf(header(f, config, null) + parts.join(''));
}

// Each group in seat order, left to right as in the hall: dot and name, and
// under it the vote's shape. Without a known vote, what the protocol says
// about it, if anything. The box sits at the bottom, in the same place on
// every picture.
function votesBox(f, d, bottom) {
  const votes = votesOf(d);
  const known = votes.some((v) => v.vote !== 'unbekannt');
  const note = String(d.votesNote || '').trim();
  if (!known && !note) return null;
  const pad = 30;
  const head = 58;
  let height;
  let body;
  if (known) {
    const gap = 12;
    const col = (INNER - 2 * pad - gap * (votes.length - 1)) / votes.length;
    // One size for every picture, whichever votes are on it.
    const pillSize = [24, 22, 20, 18].find((s) => Object.values(VOTE_LABEL).every((l) => measure(f.bold, l, s) <= col - 20)) || 18;
    const nameSize = [27, 25, 23, 21].find((s) => votes.every((v) => measure(f.bold, v.fraktion, s) <= col - 26)) || 21;
    height = 2 * pad + head + 34 + 14 + 50;
    const row = bottom - height + pad + head;
    body = votes
      .map((v, i) => {
        const x = M + pad + i * (col + gap);
        return `<circle cx="${n1(x + 8)}" cy="${row + 17}" r="8" fill="${PARTY[v.fraktion] || '#9a9288'}"/>${
          lines(f.bold, [v.fraktion], { x: x + 26, y: row, size: nameSize, leading: 34 / nameSize }).svg
        }${pill(f.bold, VOTE_LABEL[v.vote] || v.vote, VOTE_SHAPE[v.vote], { x, y: row + 48, size: pillSize, h: 50, w: col }).svg}`;
      })
      .join('');
  } else {
    const text = fit(f.text, note, { sizes: [28, 26], width: INNER - 2 * pad, maxLines: 4, leading: 1.4 });
    height = 2 * pad + head + text.size * 1.4 * text.lines.length;
    body = lines(f.text, text.lines, { x: M + pad, y: bottom - height + pad + head - 8, size: text.size, leading: 1.4, fill: C.ink2 }).svg;
  }
  const top = bottom - height;
  const title = lines(f.bold, ['Abstimmung'], { x: M + pad, y: top + pad, size: 28, leading: 36 / 28 });
  return { top, svg: `<rect x="${M}" y="${n1(top)}" width="${INNER}" height="${n1(height)}" rx="28" fill="${C.stone}"/>${title.svg}${body}` };
}

function decisionSlide(f, config, article, d, i, count) {
  const parts = [header(f, config, article.sitting_date)];
  let y = 210;
  const eyebrow = lines(f.text, [`Beschluss ${i + 1} von ${count}`], { x: M, y, size: 30, leading: 1.3, fill: C.ink3 });
  parts.push(eyebrow.svg);
  y += eyebrow.height + 18;
  const headline = fit(f.display, d.headline || d.title, { sizes: [66, 60, 56, 52, 48], width: INNER, maxLines: 4, leading: 1.15 });
  const h = lines(f.display, headline.lines, { x: M, y, size: headline.size, leading: 1.15 });
  parts.push(h.svg);
  y += h.height + 30;
  parts.push(pill(f.bold, RESULT_LABEL[d.result] || d.result || 'Beschlossen', RESULT_SHAPE[d.result] || 'settled', { x: M, y, size: 28, h: 58 }).svg);
  y += 58 + 40;
  const box = votesBox(f, d, H - M);
  const room = (box ? box.top - 44 : H - M) - y;
  const summary = fit(f.text, d.summary, { sizes: [38, 36, 34, 32, 30, 28], width: INNER, height: room, leading: 1.45 });
  parts.push(lines(f.text, summary.lines, { x: M, y, size: summary.size, leading: 1.45, fill: C.ink2 }).svg);
  if (box) parts.push(box.svg);
  return svgOf(parts.join(''));
}

function endSlide(f, config, article) {
  const parts = [header(f, config, article.sitting_date)];
  const host = new URL(config.baseUrl).host;
  let y = 230;
  const common = String((article.body || {}).commonGround || '').trim();
  if (common) {
    const pad = 44;
    const text = fit(f.text, common, { sizes: [34, 32, 30, 28], width: INNER - 2 * pad, maxLines: 7, leading: 1.45 });
    const height = 2 * pad + 56 + 14 + text.size * 1.45 * text.lines.length;
    parts.push(
      `<rect x="${M}" y="${y}" width="${INNER}" height="${n1(height)}" rx="32" fill="${C.stone}"/>`,
      lines(f.display, ['Gemeinsamkeiten'], { x: M + pad, y: y + pad, size: 44, leading: 56 / 44 }).svg,
      lines(f.text, text.lines, { x: M + pad, y: y + pad + 70, size: text.size, leading: 1.45, fill: C.ink2 }).svg,
    );
    y += height + 70;
  } else {
    y = 330;
  }
  const head = lines(f.display, ['Alles zum Nachlesen'], { x: M, y, size: 58, leading: 1.15 });
  y += head.height + 20;
  const text = fit(f.text, 'Jede Quelle, die Abstimmungen und die Diskussion stehen im Artikel:', { sizes: [34, 32], width: INNER, maxLines: 3, leading: 1.45 });
  const t = lines(f.text, text.lines, { x: M, y, size: text.size, leading: 1.45, fill: C.ink2 });
  y += t.height + 16;
  const link = fit(f.bold, `${host}/artikel/${article.slug}`, { sizes: [38, 34, 30, 26], width: INNER, maxLines: 2, leading: 1.3 });
  const l = lines(f.bold, link.lines, { x: M, y, size: link.size, leading: 1.3 });
  y += l.height + 30;
  const bio = pill(f.bold, 'Link in der Bio', 'outlined', { x: M, y, size: 28, h: 58 });
  const disclaimer = fit(
    f.text,
    'Die Texte schreibt eine KI (Claude von Anthropic) nur auf Grundlage der Dokumente des Bundestags, sachlich und ohne Wertung. Fehler sind möglich – deshalb ist im Artikel jede Quelle verlinkt.',
    { sizes: [25, 23], width: INNER, maxLines: 4, leading: 1.45 },
  );
  const dh = disclaimer.size * 1.45 * disclaimer.lines.length;
  parts.push(head.svg, t.svg, l.svg, bio.svg, lines(f.text, disclaimer.lines, { x: M, y: H - M - dh, size: disclaimer.size, leading: 1.45, fill: C.ink3 }).svg);
  return svgOf(parts.join(''));
}

// --- the carousel -------------------------------------------------------------------

export function slidesOf(article) {
  const decisions = ((article.body || {}).decisions || []).slice(0, MAX_SLIDES - 2);
  return [{ kind: 'cover' }, ...decisions.map((d, i) => ({ kind: 'decision', d, i })), { kind: 'end' }];
}

export const slideCount = (article) => slidesOf(article).length;

// Picture `n` (from 1) as SVG, or null.
export function slideSvg(config, article, n) {
  const slides = slidesOf(article);
  const slide = slides[n - 1];
  if (!slide) return null;
  const f = fonts();
  const count = slides.length - 2;
  if (slide.kind === 'cover') return cover(f, config, article, count);
  if (slide.kind === 'decision') return decisionSlide(f, config, article, slide.d, slide.i, count);
  return endSlide(f, config, article);
}

// The same as a JPEG. The last few are kept, since Instagram, the admin's
// preview and a reload all ask for the same pictures within minutes; a
// rewritten article (a new created_at) draws them anew.
const drawn = new Map();

export async function slideImage(config, article, n) {
  const key = `${article.id}:${new Date(article.created_at).getTime()}:${n}`;
  if (drawn.has(key)) return drawn.get(key);
  const svg = slideSvg(config, article, n);
  if (!svg) return null;
  // Loaded on first use: the site runs without the native renderer, only the
  // pictures need it.
  const { Resvg } = await import('@resvg/resvg-js');
  const img = new Resvg(svg, { font: { fontFiles: Object.values(FONTS).map((x) => path.join(FONT_DIR, x.file)), loadSystemFonts: false, defaultFontFamily: 'Figtree' } }).render();
  const data = Buffer.from(jpeg.encode({ data: img.pixels, width: img.width, height: img.height }, 90).data);
  drawn.set(key, data);
  if (drawn.size > MAX_SLIDES + 2) drawn.delete(drawn.keys().next().value);
  return data;
}
