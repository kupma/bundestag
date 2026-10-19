// The site's marks. The logo is the plenary hall seen from above: three
// rows of seats around the lectern. Marks never carry meaning by colour
// (which would be political); they hold in greyscale, colour blindness and
// dark mode alike.

import { raw } from '../html.js';

// Three arcs, the rows of seats; open at the bottom, where the lectern is.
// The Instagram pictures draw them too (views/slides.js).
export const HALL = '<path d="M5 23a15 15 0 0 1 30 0"/><path d="M10.5 23a9.5 9.5 0 0 1 19 0"/><path d="M16 23a4 4 0 0 1 8 0"/>';

export const logoMark = () => raw(`<svg class="logo-mark" viewBox="0 0 40 26" aria-hidden="true">${HALL}</svg>`);

// The same, large, for empty pages.
export const hallMark = () => raw(`<svg class="hall-mark" viewBox="0 0 40 26" aria-hidden="true">${HALL}</svg>`);

// A decision still to be taken: an empty, dashed circle.
export const pendingMark = ({ size = '' } = {}) =>
  raw(`<svg class="pending-mark${size ? ` pending-${size}` : ''}" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="8.5"/></svg>`);

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
