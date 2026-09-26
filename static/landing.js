// The plenary hall on the landing page. A tiny 3D renderer on a 2D canvas: the
// seats of the Bundestag as dots on rising, curved tiers, the lectern and the
// President's desk as boxes. Scrolling moves the camera from high above the
// hall – the seating plan – down in a slow arc to the lectern, where the
// reader ends up facing the members: "Jetzt hast du das Wort."
//
// No library, no colour of any party: the seats wear the page's ink tones,
// and groups are told apart by the aisles between them and their names.

(() => {
  const canvas = document.querySelector('.plenum-canvas');
  const section = document.querySelector('.plenum');
  if (!canvas || !section || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const stage = canvas.parentElement;
  const steps = [...section.querySelectorAll('.step')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.documentElement.classList.add('js-plenum');

  // --- the hall ------------------------------------------------------------------

  let groups;
  try {
    groups = JSON.parse(canvas.dataset.plenum);
  } catch {
    return;
  }
  const TOTAL = groups.reduce((n, g) => n + g.seats, 0);
  const ROWS = 12;
  const SPAN = (200 * Math.PI) / 180; // the rows wrap a little past the sides
  const AISLE = (2.4 * Math.PI) / 180;
  const CENTER_Z = -1; // the rows are arcs around a point just behind the lectern
  const rowRadius = (i) => 6 + i * 1.15;
  const rowHeight = (i) => i * 0.42;

  // Seats per row in proportion to the row's length, exactly TOTAL in all.
  const radii = Array.from({ length: ROWS }, (_, i) => rowRadius(i));
  const sumR = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map((r) => Math.round((TOTAL * r) / sumR));
  perRow[ROWS - 1] += TOTAL - perRow.reduce((a, b) => a + b, 0);

  // Every seat evenly spaced in its row; then, sorted from left to right, the
  // first 64 are the first group, the next 85 the second … – which gives the
  // wedges of a real seating plan.
  const seats = [];
  perRow.forEach((n, row) => {
    for (let j = 0; j < n; j++) seats.push({ row, a: -SPAN / 2 + ((j + 0.5) * SPAN) / n });
  });
  seats.sort((p, q) => p.a - q.a || p.row - q.row);
  let k = 0;
  groups.forEach((g, gi) => {
    for (let n = 0; n < g.seats; n++) seats[k++].group = gi;
  });
  const G = groups.length;
  const squeeze = 1 - ((G - 1) * AISLE) / SPAN;
  // A fixed pseudo-random order for the vote, so it looks the same every time.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const s of seats) {
    const a = s.a * squeeze + (s.group - (G - 1) / 2) * AISLE;
    const r = rowRadius(s.row);
    s.p = [r * Math.sin(a), rowHeight(s.row) + 0.35, CENTER_Z + r * Math.cos(a)];
    s.rnd = rnd();
  }

  // Where each group's name goes: above the back row, in the middle of its wedge.
  const labels = groups.map((g, gi) => {
    const mine = seats.filter((s) => s.group === gi);
    const a = mine.reduce((sum, s) => sum + Math.atan2(s.p[0], s.p[2] - CENTER_Z), 0) / mine.length;
    const r = rowRadius(ROWS - 1) + 2.2;
    return { text: g.short, sub: String(g.seats), p: [r * Math.sin(a), rowHeight(ROWS - 1) + 1.2, CENTER_Z + r * Math.cos(a)] };
  });

  // The tiers: an arc along the front edge of every row's desks.
  const tiers = radii.map((r, i) => {
    const pts = [];
    for (let j = 0; j <= 48; j++) {
      const a = -SPAN / 2 + (j * SPAN) / 48;
      pts.push([(r - 0.5) * Math.sin(a), rowHeight(i) + 0.3, CENTER_Z + (r - 0.5) * Math.cos(a)]);
    }
    return pts;
  });

  // The visitors' gallery behind the last row: two arcs and the public on it.
  // It only appears on the way down, when it frames the view from the lectern.
  const arc = (r, y, n = 64) =>
    Array.from({ length: n + 1 }, (_, j) => {
      const a = -SPAN / 2 + (j * SPAN) / n;
      return [r * Math.sin(a), y, CENTER_Z + r * Math.cos(a)];
    });
  const gallery = [arc(23, 7), arc(23.2, 9.6)];
  const publicSeats = arc(23.6, 7.5, 150).filter((_, j) => j % 3 !== 1);

  const box = (cx, cz, w, d, h, kind) => ({ cx, cz, w, d, h, kind });
  const boxes = [
    box(0, -1.5, 1.2, 0.8, 1.1, 'lectern'),
    box(0, -4.6, 5.2, 1.4, 1.7, 'desk'), // the President
    box(-5.8, -3.4, 4.2, 1.1, 0.9, 'desk'), // the government's bench
    box(5.8, -3.4, 4.2, 1.1, 0.9, 'desk'), // the Bundesrat's bench
  ];

  // --- camera ----------------------------------------------------------------------

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const mix = (a, b, t) => a + (b - a) * t;
  const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const ease = (t) => t * t * (3 - 2 * t);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const band = (s, a, b) => clamp((s - a) / (b - a));

  let W = 0;
  let H = 0;
  let dpr = 1;
  let cam;
  let topHeight = 40;

  // t = 0: straight above the hall, the lectern at the bottom of the screen.
  // t = 1: standing behind the lectern at eye height, facing the members.
  function camera(t) {
    const wide = W > 900 * dpr;
    const cx = mix(wide ? W * 0.64 : W / 2, W / 2, ease(t));
    // On a phone the text sits in the lower half, so the hall goes on top.
    const cy = mix(wide ? H * 0.5 : H * 0.23, wide ? H * 0.5 : H * 0.3, ease(t));
    const fov = (mix(50, 58, t) * Math.PI) / 180;
    // From above everything fits; at the lectern a tall screen crops the
    // sides rather than shrinking the hall to a thin band.
    const f = (0.5 * mix(Math.min(W, H), H, ease(t))) / Math.tan(fov / 2);
    const need = topHeight;
    const top = [0, need, 6.3];
    const swing = [-10, need * 0.6, -10];
    const end = [0, 1.8, -2.55];
    const u = easeInOut(t);
    const pos = [0, 1, 2].map((i) => (1 - u) * (1 - u) * top[i] + 2 * (1 - u) * u * swing[i] + u * u * end[i]);
    const target = mix3([0, 0, 6.3], [0, 1.2, 14], ease(t));
    const fwd = norm(sub(target, pos));
    const upHint = norm(mix3([0, 0, 1], [0, 1, 0], u));
    const right = norm(cross(upHint, fwd));
    const up = cross(fwd, right);
    return { pos, fwd, right, up, f, cx, cy };
  }

  function project(p) {
    const d = sub(p, cam.pos);
    const z = dot(d, cam.fwd);
    if (z < 0.25) return null;
    return { x: cam.cx + (dot(d, cam.right) / z) * cam.f, y: cam.cy - (dot(d, cam.up) / z) * cam.f, z, s: cam.f / z };
  }

  // How high to hover at the start so the whole plan – seats, names, the front
  // – fits into the part of the screen the text leaves free. Measured, not
  // guessed: perspective makes the raised back rows larger than they are.
  function fitTop() {
    const pts = [...seats.map((x) => x.p), ...tiers.flat(), ...boxes.flatMap((b) => [[b.cx - b.w / 2, b.h, b.cz - b.d / 2], [b.cx + b.w / 2, b.h, b.cz - b.d / 2]])];
    const fits = (h) => {
      topHeight = h;
      cam = camera(0);
      const halfW = Math.min(cam.cx, W - cam.cx) - 12 * dpr;
      const halfH = Math.min(cam.cy, H - cam.cy) - 12 * dpr;
      for (const p of pts) {
        const q = project(p);
        if (!q || Math.abs(q.x - cam.cx) > halfW || Math.abs(q.y - cam.cy) > halfH) return false;
      }
      for (const l of labels) {
        const q = project(l.p);
        const size = q ? clamp(0.95 * q.s, 11 * dpr, 20 * dpr) : 0;
        if (!q || Math.abs(q.x - cam.cx) + size * 2.2 > halfW || Math.abs(q.y - cam.cy) + size * 1.2 > halfH) return false;
      }
      return true;
    };
    let lo = 10;
    let hi = 400;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    topHeight = hi;
  }

  // --- colours from the stylesheet (they follow light and dark mode) ------------------

  let C = {};
  function readColours() {
    const css = getComputedStyle(document.documentElement);
    const hex = (name, fallback) => {
      const v = css.getPropertyValue(name).trim() || fallback;
      const m = /^#?([0-9a-f]{6})$/i.exec(v);
      const n = m ? parseInt(m[1], 16) : 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    C = {
      paper: hex('--paper', '#f6f3ee'),
      surface: hex('--surface', '#fffdfa'),
      ink: hex('--ink', '#2b2926'),
      ink2: hex('--ink-2', '#57524b'),
      ink3: hex('--ink-3', '#807970'),
      stone2: hex('--stone-2', '#e5dfd5'),
      stone3: hex('--stone-3', '#d6cec2'),
    };
  }
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const blend = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)].map(Math.round);

  // --- drawing ---------------------------------------------------------------------

  function drawBox(b) {
    const x0 = b.cx - b.w / 2;
    const x1 = b.cx + b.w / 2;
    const z0 = b.cz - b.d / 2;
    const z1 = b.cz + b.d / 2;
    const h = b.h;
    const faces = [
      { n: [0, 1, 0], v: [[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]], shade: 0 },
      { n: [0, 0, -1], v: [[x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0]], shade: 0.1 },
      { n: [0, 0, 1], v: [[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]], shade: 0.1 },
      { n: [-1, 0, 0], v: [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]], shade: 0.18 },
      { n: [1, 0, 0], v: [[x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0]], shade: 0.18 },
    ];
    for (const face of faces) {
      const centre = face.v.reduce((a, v) => [a[0] + v[0] / 4, a[1] + v[1] / 4, a[2] + v[2] / 4], [0, 0, 0]);
      if (dot(face.n, sub(cam.pos, centre)) <= 0) continue;
      const pts = face.v.map(project);
      if (pts.some((p) => !p)) continue;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      const base = b.kind === 'lectern' ? C.surface : C.stone2;
      ctx.fillStyle = rgba(blend(base, C.ink3, face.shade));
      ctx.fill();
      ctx.lineWidth = dpr;
      ctx.strokeStyle = rgba(C.ink3, b.kind === 'lectern' ? 0.9 : 0.5);
      ctx.stroke();
    }
  }

  function render(s) {
    const t = reduced.matches ? 0 : ease(band(s, 0.16, 0.86));
    cam = camera(t);
    ctx.clearRect(0, 0, W, H);

    // the floor of the hall: a soft disc under the tiers
    const floor = project([0, 0, 6]);
    if (floor && t < 0.9) {
      const r = 22 * floor.s;
      const g = ctx.createRadialGradient(floor.x, floor.y, r * 0.1, floor.x, floor.y, r);
      g.addColorStop(0, rgba(C.stone2, 0.55 * (1 - t)));
      g.addColorStop(1, rgba(C.stone2, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // tiers
    ctx.lineWidth = dpr;
    ctx.strokeStyle = rgba(C.stone3, 0.9);
    for (const tier of tiers) {
      ctx.beginPath();
      let open = false;
      for (const v of tier) {
        const p = project(v);
        if (!p) {
          open = false;
          continue;
        }
        if (open) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
        open = true;
      }
      ctx.stroke();
    }

    // the gallery
    const galleryAlpha = band(t, 0.35, 0.85);
    if (galleryAlpha > 0.01) {
      ctx.strokeStyle = rgba(C.stone3, galleryAlpha);
      for (const line of gallery) {
        ctx.beginPath();
        let open = false;
        for (const v of line) {
          const p = project(v);
          if (!p) {
            open = false;
            continue;
          }
          if (open) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
          open = true;
        }
        ctx.stroke();
      }
      ctx.fillStyle = rgba(C.ink3, 0.35 * galleryAlpha);
      for (const v of publicSeats) {
        const p = project(v);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.8 * dpr, 0.18 * p.s), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // the vote (step 3): seats light up, then settle again
    const vote = reduced.matches ? 0 : band(s, 0.47, 0.62) * (1 - band(s, 0.66, 0.78));
    const visible = [];
    for (const seat of seats) {
      const p = project(seat.p);
      if (p) visible.push([p, seat]);
    }
    visible.sort((a, b) => b[0].z - a[0].z);
    for (const [p, seat] of visible) {
      const lit = clamp((vote - seat.rnd * 0.55) * 3);
      // a flat disc on the desk: round from above, an ellipse from the lectern
      const r = Math.max(0.9 * dpr, 0.26 * p.s * (1 + 0.2 * lit));
      const d = norm(sub(seat.p, cam.pos));
      const squash = Math.max(0.3, Math.abs(dot(d, [0, 1, 0])));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * squash, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(blend(C.ink3, C.ink, lit), 0.78 + 0.22 * lit);
      ctx.fill();
    }

    // the front: lectern, President, benches – far ones first
    const byDepth = boxes
      .map((b) => ({ b, d: dot(sub([b.cx, b.h / 2, b.cz], cam.pos), cam.fwd) }))
      .sort((a, b) => b.d - a.d);
    for (const { b } of byDepth) drawBox(b);

    // "versprochen" and "beschlossen" (step 4): the two circles, over the hall
    const circles = reduced.matches ? 0 : band(s, 0.64, 0.74) * (1 - band(s, 0.84, 0.92));
    if (circles > 0.01) {
      const spread = mix(3.4, 1.3, band(s, 0.66, 0.8));
      for (const [x, label] of [
        [-spread, 'versprochen'],
        [spread, 'beschlossen'],
      ]) {
        const p = project([x, 8.5, 12]);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * p.s, 0, Math.PI * 2);
        ctx.fillStyle = rgba(C.surface, 0.35 * circles);
        ctx.fill();
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = rgba(C.ink, 0.85 * circles);
        ctx.stroke();
        ctx.fillStyle = rgba(C.ink2, circles);
        ctx.font = `600 ${Math.round(clamp(0.5 * p.s, 11 * dpr, 17 * dpr))}px Figtree, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, p.x + Math.sign(x) * 1.2 * p.s, p.y);
      }
    }

    // names of the groups, and where the lectern is
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelAlpha = 1 - 0.55 * band(t, 0.75, 1);
    for (const l of labels) {
      const p = project(l.p);
      if (!p) continue;
      const size = clamp(0.95 * p.s, 11 * dpr, 20 * dpr);
      ctx.fillStyle = rgba(C.ink, labelAlpha);
      ctx.font = `600 ${Math.round(size)}px Figtree, system-ui, sans-serif`;
      ctx.fillText(l.text, p.x, p.y);
      ctx.fillStyle = rgba(C.ink3, labelAlpha);
      ctx.font = `500 ${Math.round(size * 0.78)}px Figtree, system-ui, sans-serif`;
      ctx.fillText(l.sub, p.x, p.y + size * 1.05);
    }
    const podium = 1 - band(t, 0.05, 0.3);
    const lp = project([0, 1.2, -0.6]);
    if (lp && podium > 0.01) {
      ctx.fillStyle = rgba(C.ink2, podium);
      ctx.font = `500 ${Math.round(12 * dpr)}px Figtree, system-ui, sans-serif`;
      ctx.fillText('Rednerpult', lp.x, lp.y - 4 * dpr);
    }
  }

  // --- scrolling -----------------------------------------------------------------------

  let queued = false;
  function progress() {
    const rect = section.getBoundingClientRect();
    const range = rect.height - window.innerHeight;
    return range > 0 ? clamp(-rect.top / range) : 0;
  }
  // The text card whose middle is closest to the middle of the screen is the
  // one fully there; the others step back.
  let active = null;
  function activate() {
    const mid = window.innerHeight / 2;
    let best = null;
    let bestD = Infinity;
    for (const el of steps) {
      const r = el.getBoundingClientRect();
      const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0;
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    }
    if (best !== active) {
      if (active) active.classList.remove('is-active');
      if (best) best.classList.add('is-active');
      active = best;
    }
  }
  function frame() {
    queued = false;
    activate();
    render(progress());
  }
  function queue() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(frame);
    }
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(stage.clientWidth * dpr);
    H = Math.round(stage.clientHeight * dpr);
    canvas.width = W;
    canvas.height = H;
    fitTop();
    queue();
  }

  readColours();
  resize();
  stage.classList.add('ready');
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', resize);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    readColours();
    queue();
  });
  reduced.addEventListener?.('change', queue);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
})();
