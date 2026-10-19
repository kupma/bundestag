// Visits per day (src/views/admin.js). Without this script every bar has the
// browser's own tooltip (a <title>, shown after a pause and never on a phone)
// and the table under the chart lists every day. This shows the day's numbers
// at once above the bar: under the pointer, where a finger taps or slides, and
// with the arrow keys.

(() => {
  const chart = document.querySelector('.bars-chart');
  if (!chart) return;
  const svg = chart.querySelector('svg');
  const tip = chart.querySelector('.bars-tip');
  const bars = [...svg.querySelectorAll('g[data-day]')];
  if (!bars.length) return;

  // The native tooltip would follow a second later, on top of this one.
  for (const title of svg.querySelectorAll('g > title')) title.remove();
  chart.classList.add('js');
  chart.querySelector('.bars-hint').hidden = false;
  svg.tabIndex = 0;

  const visits = document.createElement('strong');
  const views = document.createTextNode('');
  const day = document.createElement('span');
  tip.append(visits, ' · ', views, day);

  let current = bars.length - 1;
  let shown = false;

  function show(i) {
    bars[current].classList.remove('active');
    current = Math.max(0, Math.min(bars.length - 1, i));
    const bar = bars[current];
    bar.classList.add('active');
    visits.textContent = bar.dataset.visits;
    views.textContent = bar.dataset.views;
    day.textContent = bar.dataset.day;
    tip.hidden = false;
    chart.classList.add('showing');
    shown = true;
    // centred over its bar, but never past the chart's edges
    const box = svg.getBoundingClientRect();
    const x = box.left - chart.getBoundingClientRect().left + ((current + 0.5) / bars.length) * box.width;
    const max = chart.clientWidth - tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(max, x - tip.offsetWidth / 2))}px`;
  }

  function hide() {
    bars[current].classList.remove('active');
    tip.hidden = true;
    chart.classList.remove('showing');
    shown = false;
  }

  const barAt = (clientX) => {
    const box = svg.getBoundingClientRect();
    return Math.floor(((clientX - box.left) / box.width) * bars.length);
  };

  svg.addEventListener('pointermove', (e) => show(barAt(e.clientX)));
  svg.addEventListener('pointerdown', (e) => show(barAt(e.clientX)));
  // A mouse that leaves takes the numbers with it; a tapped day stays until
  // the next tap somewhere else.
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && document.activeElement !== svg) hide();
  });
  document.addEventListener('pointerdown', (e) => {
    if (shown && !svg.contains(e.target)) hide();
  });

  svg.addEventListener('focus', () => show(current));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    const to = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: bars.length - 1,
    }[e.key];
    if (to !== undefined) show(to);
    else if (e.key === 'Escape') hide();
    else return;
    e.preventDefault();
  });

  window.addEventListener('resize', () => {
    if (shown) show(current);
  });
})();
