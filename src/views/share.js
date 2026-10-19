// Sharing an article or one of its decisions, the way apps do: a small
// "Teilen" button opens a sheet with what is being shared and a row of round
// buttons, one per messenger or network.
//
// The sheet is a native <details>, so it works without JavaScript: the
// services are plain links (no widget, nothing loads from them until someone
// taps one), the address can be copied from its field, and a tap beside the
// sheet closes it. static/share.js adds what needs a script: "Link kopieren",
// the device's own share menu ("Mehr …"), Escape, one sheet at a time.

import { html } from '../html.js';
import { cls, RESULT_LABEL } from './labels.js';
import { ASSET_VERSION } from './layout.js';

const enc = encodeURIComponent;

// Each service gets the address and one line of text saying what it is.
const SERVICES = [
  ['whatsapp', 'WhatsApp', ({ url, text }) => `https://wa.me/?text=${enc(`${text}\n${url}`)}`],
  ['telegram', 'Telegram', ({ url, text }) => `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`],
  ['mail', 'E-Mail', ({ url, text }) => `mailto:?subject=${enc(text)}&body=${enc(`${text}\n\n${url}`)}`],
  ['bluesky', 'Bluesky', ({ url, text }) => `https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}`],
  ['x', 'X', ({ url, text }) => `https://x.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`],
  ['facebook', 'Facebook', ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
];

const icon = (name) => html`<svg class="share-svg" aria-hidden="true"><use href="/static/share-icons.svg?v=${ASSET_VERSION.shareIcons}#${name}"></use></svg>`;

// `url` and `text` are what gets shared; `heading` names the sheet, and the
// preview repeats what is shared: a date line, the headline and, for a
// decision, its result. `context` tells screen readers which of several
// buttons on a page this one is.
export function shareSheet({ url, text, heading, eyebrow = '', headline, result = '', context = '' }) {
  const target = (name, label) => html`<span class="share-circle">${icon(name)}</span><span class="share-label">${label}</span>`;
  return html`<details class="share" data-share-url="${url}" data-share-text="${text}">
    <summary>${icon('teilen')}<span>Teilen</span>${context ? html`<span class="visually-hidden">: ${context}</span>` : ''}</summary>
    <div class="share-sheet">
      <p class="share-heading">${heading}</p>
      <button type="button" class="share-close" aria-label="Schließen" hidden><span aria-hidden="true">×</span></button>
      <div class="share-preview">
        ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
        <p class="share-headline">${headline}</p>
        ${result ? html`<span class="result result-${cls(result)}">${RESULT_LABEL[result] || result}</span>` : ''}
      </div>
      <ul class="share-targets">
        <li hidden><button type="button" class="share-target" data-share="copy">${target('link', 'Link kopieren')}</button></li>
        ${SERVICES.map(
          ([name, label, href]) => html`<li><a class="share-target" href="${href({ url, text })}"${name === 'mail' ? '' : html` target="_blank" rel="noopener"`}>${target(name, label)}</a></li>`,
        )}
        <li hidden><button type="button" class="share-target" data-share="native">${target('mehr', 'Mehr …')}</button></li>
      </ul>
      <input class="share-url" type="text" value="${url}" readonly aria-label="Link zum Kopieren">
      <p class="visually-hidden" role="status" data-share-status></p>
    </div>
  </details>`;
}
