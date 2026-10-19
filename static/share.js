// Share sheets (src/views/share.js). Without this script they already work:
// links to the services, the address in a field to copy, a tap beside the
// sheet closes it. This adds "Link kopieren", the device's own share menu
// ("Mehr …", where the browser has one), a close button and Escape, and keeps
// one sheet open at a time.

(() => {
  const sheets = [...document.querySelectorAll('details.share')];
  if (!sheets.length) return;
  const canShare = typeof navigator.share === 'function';

  const close = (s, { focus = false } = {}) => {
    s.open = false;
    if (focus) s.querySelector('summary').focus();
  };

  async function copy(value, field) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // no clipboard API (an http address, an old browser): the field's way
      field.select();
      try {
        return document.execCommand('copy');
      } catch {
        return false;
      }
    }
  }

  for (const s of sheets) {
    const url = s.dataset.shareUrl;
    const text = s.dataset.shareText;
    const field = s.querySelector('.share-url');
    const status = s.querySelector('[data-share-status]');
    const copyButton = s.querySelector('[data-share="copy"]');
    const nativeButton = s.querySelector('[data-share="native"]');
    const closeButton = s.querySelector('.share-close');

    copyButton.parentElement.hidden = false;
    if (canShare) nativeButton.parentElement.hidden = false;
    closeButton.hidden = false;

    s.addEventListener('toggle', () => {
      if (!s.open) return;
      for (const other of sheets) if (other !== s && other.open) other.open = false;
      s.querySelector('li:not([hidden]) .share-target').focus({ preventScroll: true });
    });

    closeButton.addEventListener('click', () => close(s, { focus: true }));

    const label = copyButton.querySelector('.share-label');
    let reset = 0;
    copyButton.addEventListener('click', async () => {
      const ok = await copy(url, field);
      label.textContent = ok ? 'Kopiert' : 'Bitte unten kopieren';
      status.textContent = ok ? 'Link kopiert.' : 'Der Link steht im Feld darunter.';
      if (!ok) field.focus();
      clearTimeout(reset);
      reset = setTimeout(() => {
        label.textContent = 'Link kopieren';
        status.textContent = '';
      }, 2500);
    });

    nativeButton.addEventListener('click', async () => {
      try {
        await navigator.share({ title: text, text, url });
        close(s);
      } catch {
        // cancelled by the reader, or refused: the sheet stays as it was
      }
    });

    // A service opens in a new tab; the sheet has done its job.
    for (const a of s.querySelectorAll('a.share-target')) a.addEventListener('click', () => setTimeout(() => close(s), 0));

    field.addEventListener('focus', () => field.select());
    field.addEventListener('click', () => field.select());

    // Tabbing out of an open sheet closes it, so it never hides the page.
    s.addEventListener('focusout', (e) => {
      if (s.open && e.relatedTarget && !s.contains(e.relatedTarget)) close(s);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = sheets.find((s) => s.open);
    if (open) close(open, { focus: true });
  });
})();
