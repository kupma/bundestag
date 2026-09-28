// Article pages: the decisions are folded (<details>). A link to one of them –
// from "Auf einen Blick" or from outside – opens it, and one button opens or
// closes all of them.

(() => {
  const folds = [...document.querySelectorAll('details.decision')];
  if (!folds.length) return;

  function openTarget() {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    const fold = el && (el.matches('details') ? el : el.closest('details'));
    if (fold && !fold.open) {
      fold.open = true;
      el.scrollIntoView();
    }
  }
  window.addEventListener('hashchange', openTarget);
  openTarget();

  const button = document.querySelector('.fold-all');
  if (!button) return;
  const label = () => {
    button.textContent = folds.every((f) => f.open) ? 'Alle zuklappen' : 'Alle aufklappen';
  };
  button.hidden = false;
  button.addEventListener('click', () => {
    const open = !folds.every((f) => f.open);
    for (const f of folds) f.open = open;
    label();
  });
  for (const f of folds) f.addEventListener('toggle', label);
  label();
})();
