// The site's shape language: two circles. The left one is what was promised,
// the right one what was decided. How they overlap is the verdict, so the
// meaning never depends on colour (which would be political) and survives
// greyscale, colour blindness and dark mode alike.

import { escapeHtml, raw } from '../html.js';

// Three clearly different distances: almost one circle, half overlapping,
// visibly apart. The difference has to survive 20 pixels on a phone.
const R = 8.5;
const POSITIONS = {
  entspricht: [18, 22],
  teilweise: [15, 25],
  widerspricht: [9.5, 30.5],
  // an empty, dashed promise next to the decision: nothing was promised
  nicht_thematisiert: [9.5, 30.5],
};

export function venn(alignment, { size = '', label = '' } = {}) {
  const [a, b] = POSITIONS[alignment] || POSITIONS.nicht_thematisiert;
  const missing = alignment === 'nicht_thematisiert' || !POSITIONS[alignment];
  const aria = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"';
  return raw(
    `<svg class="venn venn-${missing ? 'nicht_thematisiert' : alignment}${size ? ` venn-${size}` : ''}" viewBox="0 0 40 22" ${aria}>` +
      `<circle cx="${a}" cy="11" r="${R}"${missing ? ' class="promise-missing"' : ''}/>` +
      `<circle cx="${b}" cy="11" r="${R}"/></svg>`,
  );
}

export const logoMark = () =>
  raw('<svg class="logo-mark" viewBox="0 0 40 26" aria-hidden="true"><circle cx="14" cy="13" r="11"/><circle cx="26" cy="13" r="11"/></svg>');

const THEME_ICONS = {
  // a calm horizon
  gelassen: '<circle cx="13" cy="11" r="4.5"/><path d="M3 17.5h20M7 21.5h12"/>',
  // a basket
  einkaufen: '<path d="M4 11h18l-2.2 10.5H6.2z"/><path d="M9 11l4-6 4 6"/>',
  // a ballot going into a box
  demokratie: '<path d="M4 13h18v9H4z"/><path d="M9 13V4.5h8V13"/><path d="M11 8.5h4"/>',
  // two people
  miteinander: '<circle cx="9" cy="9" r="3.5"/><circle cx="17" cy="9" r="3.5"/><path d="M3 21.5c0-3.6 2.7-6 6-6s6 2.4 6 6M11 21.5c0-3.6 2.7-6 6-6s6 2.4 6 6"/>',
};

export const themeIcon = (id) => raw(`<span class="theme-icon" aria-hidden="true"><svg viewBox="0 0 26 26">${THEME_ICONS[id] || ''}</svg></span>`);
