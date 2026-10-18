// The plenary hall on the landing page. A tiny 3D renderer on a 2D canvas: the
// seats of the Bundestag as dots on rising, curved tiers, the lectern and the
// President's desk as boxes. Scrolling carries the camera from above the hall
// – the seating plan – in a slow descent to the lectern, where the reader ends
// up facing the members: "Jetzt hast du das Wort."
//
// And the hall is never quiet. Lines of debate arc from seat to seat, always
// across an aisle: someone speaks, someone from another group answers, and
// that answer is answered again. No line ends in the void and no group is
// left out – a democracy is people who keep talking to each other. During
// the vote the hall falls silent, then the talking goes on. Choosing a seat
// lets it speak; at the lectern, the reader is part of the conversation.
//
// No library, no colour of any party: the seats and lines wear the page's ink
// tones, and groups are told apart by the aisles between them and their names.

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
  seats.forEach((s, i) => {
    const a = s.a * squeeze + (s.group - (G - 1) / 2) * AISLE;
    const r = rowRadius(s.row);
    s.p = [r * Math.sin(a), rowHeight(s.row) + 0.35, CENTER_Z + r * Math.cos(a)];
    s.rnd = rnd();
    s.i = i;
  });

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

  const RAD = Math.PI / 180;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const mix = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const ease = (t) => t * t * (3 - 2 * t);
  const band = (s, a, b) => clamp((s - a) / (b - a));

  let W = 0;
  let H = 0;
  let dpr = 1;
  let cam;

  // One view per text card, from the seating plan down to the lectern. The
  // first four circle a point of the hall – az around it, el above the floor,
  // in degrees – and back off until the whole plan fits beside the text
  // (`fit` below 1 comes closer). The last two stand at fixed places: behind
  // the President's desk, then behind the lectern at eye height. cx/cy put the
  // hall where the text leaves room – right of it on a wide screen, above it
  // on a phone – and `tall` lets a tall screen crop the sides rather than
  // shrink the hall to a thin band.
  const VIEWS = [
    { az: -16, el: 58, target: [0, 1.5, 6], fit: 1, fov: 40, wide: [0.64, 0.5], narrow: [0.5, 0.23] },
    { az: 0, el: 84, target: [0, 1.5, 6], fit: 1, fov: 40, wide: [0.64, 0.5], narrow: [0.5, 0.25] },
    { az: 24, el: 42, target: [0, 1.5, 6.5], fit: 1, fov: 40, wide: [0.64, 0.5], narrow: [0.5, 0.26] },
    { az: -10, el: 32, target: [0, 1.5, 7], fit: 1, fov: 44, wide: [0.62, 0.5], narrow: [0.5, 0.27] },
    { from: [0, 4.4, -8.5], target: [0, 1.8, 10], fov: 50, tall: 0.5, wide: [0.58, 0.5], narrow: [0.5, 0.3] },
    { from: [0, 1.8, -2.55], target: [0, 1.2, 14], fov: 58, tall: 1, wide: [0.5, 0.5], narrow: [0.5, 0.3] },
  ];
  // Each view as numbers – [az, el, distance, target x, y, z, fov, cx, cy,
  // tall] – worked out for the current screen.
  let keys = [];

  function pose(key) {
    const [azD, elD, d, tx, ty, tz, fov, cx, cy, tall] = key;
    const az = azD * RAD;
    const el = elD * RAD;
    const back = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
    const fwd = [-back[0], -back[1], -back[2]];
    const right = [Math.cos(az), 0, Math.sin(az)];
    return {
      pos: [tx + d * back[0], ty + d * back[1], tz + d * back[2]],
      fwd,
      right,
      up: cross(fwd, right),
      f: (0.5 * mix(Math.min(W, H), H, tall)) / Math.tan((fov * RAD) / 2),
      cx: cx * W,
      cy: cy * H,
    };
  }

  function project(p) {
    const d = sub(p, cam.pos);
    const z = dot(d, cam.fwd);
    if (z < 0.25) return null;
    return { x: cam.cx + (dot(d, cam.right) / z) * cam.f, y: cam.cy - (dot(d, cam.up) / z) * cam.f, z, s: cam.f / z };
  }

  // How far back a view has to be for the whole plan – seats, names, the
  // front – to fit into the part of the screen the text leaves free. Measured,
  // not guessed: perspective makes the raised back rows larger than they are.
  const outline = [...seats.map((x) => x.p), ...tiers.flat(), ...boxes.flatMap((b) => [[b.cx - b.w / 2, b.h, b.cz - b.d / 2], [b.cx + b.w / 2, b.h, b.cz - b.d / 2]])];
  function fitDistance(key) {
    const fits = (d) => {
      cam = pose([key[0], key[1], d, ...key.slice(3)]);
      // a little to spare for the camera's slow sway
      const halfW = (Math.min(cam.cx, W - cam.cx) - 12 * dpr) * 0.96;
      const halfH = (Math.min(cam.cy, H - cam.cy) - 12 * dpr) * 0.96;
      for (const p of outline) {
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
    let lo = 5;
    let hi = 400;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  function resolveViews() {
    const wide = W > 900 * dpr;
    // On a wide screen the plan goes into the room right of its card, so that
    // no group sits behind the text.
    const left = stage.getBoundingClientRect().left;
    const rooms = steps.map((el) => {
      const card = el.querySelector('.step-card');
      return card ? (W - (card.getBoundingClientRect().right - left + 20) * dpr) / W : 0;
    });
    keys = VIEWS.map((v, i) => {
      let [cx, cy] = wide ? v.wide : v.narrow;
      if (wide && !v.from && rooms[i] > 0.4) cx = 1 - rooms[i] / 2;
      if (v.from) {
        const off = sub(v.from, v.target);
        const d = Math.hypot(off[0], off[1], off[2]);
        return [Math.atan2(off[0], -off[2]) / RAD, Math.asin(off[1] / d) / RAD, d, ...v.target, v.fov, cx, cy, v.tall];
      }
      const key = [v.az, v.el, 0, ...v.target, v.fov, cx, cy, 0];
      key[2] = fitDistance(key) * v.fit;
      return key;
    });
  }

  // Between two views the camera follows a smooth curve through all of them
  // that never overshoots (Fritsch–Carlson), slowing down a little where a
  // card is being read.
  function viewAt(s) {
    const n = keys.length - 1;
    const x = clamp(s) * n;
    const i = Math.min(n - 1, Math.floor(x));
    const u = mix(x - i, ease(x - i), 0.6);
    const u2 = u * u;
    const u3 = u2 * u;
    return keys[0].map((_, f) => {
      const p = (j) => keys[clamp(j, 0, n)][f];
      const slope = (j) => {
        const d0 = p(j) - p(j - 1);
        const d1 = p(j + 1) - p(j);
        if (d0 * d1 <= 0) return 0;
        return Math.sign(d0) * Math.min(Math.abs(d0 + d1) / 2, 3 * Math.abs(d0), 3 * Math.abs(d1));
      };
      return (2 * u3 - 3 * u2 + 1) * p(i) + (u3 - 2 * u2 + u) * slope(i) + (-2 * u3 + 3 * u2) * p(i + 1) + (u3 - u2) * slope(i + 1);
    });
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

  // --- the debate --------------------------------------------------------------------

  const LECTERN = -1; // a speaker who is not in a seat: whoever stands at the lectern
  const LECTERN_P = [0, 1.1, -1.1];
  // the seats the lectern faces – the ends of the rows are beside it
  const facing = seats.filter((s) => Math.abs(s.a) < 1.15).map((s) => s.i);
  const TRACE = 7; // seconds a line stays visible after it has arrived
  const at = (e) => (e === LECTERN ? LECTERN_P : seats[e].p);
  const slot = (e) => (e === LECTERN ? seats.length : e);
  const groupOf = (e) => (e === LECTERN ? -1 : seats[e].group);
  const voteAt = (s) => band(s, 0.5, 0.6) * (1 - band(s, 0.66, 0.76));

  let clock = 0;
  let lecternShare = 0;
  const lines = []; // { a, b, p0, p1, p2, t0, dur }
  const rings = []; // { e, t0 } – someone takes the floor
  const glow = new Float32Array(seats.length + 1);
  const talks = []; // { at, prev, hops, arrive, next }
  const still = []; // without motion: the lines drawn once, all at rest

  // An arc from speaker to listener, the higher the farther apart, and bent
  // a little to one side, so that it curves even seen from straight above.
  function makeLine(a, b, t0 = 0, random = Math.random) {
    const p0 = at(a);
    const p2 = at(b);
    const dx = p2[0] - p0[0];
    const dz = p2[2] - p0[2];
    const dist = Math.hypot(dx, dz);
    const bend = (random() - 0.5) * 0.5;
    const p1 = [(p0[0] + p2[0]) / 2 - dz * bend, Math.max(p0[1], p2[1]) + 1 + 0.3 * dist, (p0[2] + p2[2]) / 2 + dx * bend];
    return { a, b, p0, p1, p2, t0, dur: 1.05 + dist * 0.045 };
  }

  // Who answers: now and then the one who spoke before, towards the end of the
  // scroll more and more often the reader at the lectern, otherwise anyone
  // from another group – never one's own.
  function answerer(talk, random = Math.random) {
    if (talk.prev != null && random() < 0.3) return talk.prev;
    if (talk.at === LECTERN) return facing[Math.floor(random() * facing.length)];
    if (Math.abs(seats[talk.at].a) < 1.15 && random() < lecternShare) return LECTERN;
    const mine = groupOf(talk.at);
    let e;
    do e = Math.floor(random() * seats.length);
    while (seats[e].group === mine);
    return e;
  }

  function speak(talk, to) {
    const line = makeLine(talk.at, to, clock);
    lines.push(line);
    rings.push({ e: talk.at, t0: clock });
    glow[slot(talk.at)] = 1;
    talk.prev = talk.at;
    talk.at = to;
    talk.arrive = clock + line.dur;
  }

  // A seat chosen by the reader takes the floor and starts a conversation of
  // its own; without motion, it gets its answer at once.
  function startTalk(e) {
    if (reduced.matches) {
      const talk = { at: e, prev: null };
      for (let n = 0; n < 2; n++) {
        const to = answerer(talk);
        still.push(makeLine(talk.at, to));
        talk.prev = talk.at;
        talk.at = to;
      }
      still.splice(0, Math.max(0, still.length - 30));
      queue();
      return;
    }
    const mine = talks.filter((t) => t.hops !== Infinity);
    if (mine.length >= 4) talks.splice(talks.indexOf(mine[0]), 1);
    talks.push({ at: e, prev: null, hops: 6, arrive: 0, next: clock });
  }

  function tick(dt, s) {
    clock += dt;
    const fade = Math.exp(-dt * 1.3);
    for (let i = 0; i < glow.length; i++) glow[i] *= fade;
    if (hover >= 0) glow[hover] = Math.max(glow[hover], 0.75);
    lecternShare = 0.06 + 0.44 * band(s, 0.8, 1);
    const hushed = voteAt(s) > 0.4;

    for (const talk of talks) {
      if (talk.arrive) {
        if (clock < talk.arrive) continue;
        // heard: the listener lights up, thinks for a moment, then answers
        glow[slot(talk.at)] = 1;
        talk.arrive = 0;
        talk.next = clock + 0.25 + Math.random() * 0.6;
      } else if (clock >= talk.next && !hushed) {
        if (talk.hops-- > 0) speak(talk, answerer(talk));
        else talk.done = true;
      }
    }
    for (let i = talks.length - 1; i >= 0; i--) if (talks[i].done) talks.splice(i, 1);

    // There is always someone talking: a few conversations that never end.
    const want = W > 900 * dpr ? 5 : 3;
    let ambient = talks.filter((t) => t.hops === Infinity).length;
    for (; ambient < want; ambient++) {
      talks.push({ at: Math.floor(Math.random() * seats.length), prev: null, hops: Infinity, arrive: 0, next: clock + Math.random() * 1.5 });
    }

    while (lines.length && clock > lines[0].t0 + lines[0].dur + TRACE) lines.shift();
    while (rings.length && clock > rings[0].t0 + 1.4) rings.shift();
  }

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

  // A line through projected points, broken where one is behind the camera.
  function polyline(pts) {
    ctx.beginPath();
    let open = false;
    for (const p of pts) {
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

  const bezier = (l, u) => {
    const w = 1 - u;
    return [0, 1, 2].map((i) => w * w * l.p0[i] + 2 * w * u * l.p1[i] + u * u * l.p2[i]);
  };
  // (whatever passes right by the camera is left out rather than drawn huge)
  const arcPoints = (l, u0, u1, n) =>
    Array.from({ length: n + 1 }, (_, j) => {
      const q = project(bezier(l, u0 + ((u1 - u0) * j) / n));
      return q && q.z > 1.2 ? q : null;
    });

  // What has been said stays a while as a faint trace; the words on their way
  // are a bright stroke that thins out behind its head.
  function drawLine(l) {
    const tau = (clock - l.t0) / l.dur;
    const head = ease(clamp(tau));
    const fade = 1 - band(clock, l.t0 + l.dur, l.t0 + l.dur + TRACE);
    if (head <= 0 || fade <= 0) return;
    ctx.lineWidth = dpr;
    ctx.strokeStyle = rgba(C.ink3, 0.42 * fade);
    polyline(arcPoints(l, 0, head, Math.max(2, Math.ceil(40 * head))));

    const tail = ease(clamp((tau - 0.25) / 0.95));
    if (head - tail < 0.002) return;
    const pts = arcPoints(l, tail, head, 20);
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1];
      const b = pts[j];
      if (!a || !b) continue;
      const w = j / (pts.length - 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = clamp(0.11 * b.s, 1.5 * dpr, 4.5 * dpr) * (0.3 + 0.7 * w);
      ctx.strokeStyle = rgba(C.ink, Math.pow(w, 1.3));
      ctx.stroke();
    }
    const h = pts[pts.length - 1];
    if (h && tau < 1) {
      const r = clamp(0.18 * h.s, 2.2 * dpr, 6 * dpr);
      ctx.fillStyle = rgba(C.ink, 0.12);
      ctx.beginPath();
      ctx.arc(h.x, h.y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(C.ink);
      ctx.beginPath();
      ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Seen at a slant, anything lying flat on a desk is an ellipse.
  const flatness = (p) => Math.max(0.3, Math.abs(dot(norm(sub(p, cam.pos)), [0, 1, 0])));

  // Taking the floor: a ring spreading out from the speaker over the desks.
  function drawRing(ring) {
    const age = (clock - ring.t0) / 1.4;
    const c = at(ring.e);
    const p = project(c);
    if (!p || age >= 1) return;
    const r = Math.min(70 * dpr, (0.3 + 1.6 * ease(age)) * p.s);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * flatness(c), 0, 0, Math.PI * 2);
    ctx.lineWidth = 1.2 * dpr;
    ctx.strokeStyle = rgba(C.ink, 0.5 * (1 - age));
    ctx.stroke();
  }

  // Where each seat was drawn last, to find the one the reader points at.
  const seen = { x: new Float32Array(seats.length), y: new Float32Array(seats.length), r: new Float32Array(seats.length) };

  function render(s) {
    const key = viewAt(s);
    if (!reduced.matches) {
      // never quite still: the camera sways a little, as if held by hand
      const sway = 1 - 0.7 * band(s, 0.75, 1);
      key[0] += 1.6 * Math.sin(clock * 0.13) * sway;
      key[1] += 1.1 * Math.sin(clock * 0.091 + 1.3) * sway;
    }
    cam = pose(key);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';

    // the floor of the hall: a soft disc under the tiers
    const floor = project([0, 0, 6]);
    const floorAlpha = 0.55 * (1 - band(s, 0.6, 0.95));
    if (floor && floorAlpha > 0.01) {
      const r = 22 * floor.s;
      const g = ctx.createRadialGradient(floor.x, floor.y, r * 0.1, floor.x, floor.y, r);
      g.addColorStop(0, rgba(C.stone2, floorAlpha));
      g.addColorStop(1, rgba(C.stone2, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // tiers
    ctx.lineWidth = dpr;
    ctx.strokeStyle = rgba(C.stone3, 0.9);
    for (const tier of tiers) polyline(tier.map(project));

    // the gallery
    const galleryAlpha = band(s, 0.55, 0.9);
    if (galleryAlpha > 0.01) {
      ctx.strokeStyle = rgba(C.stone3, galleryAlpha);
      for (const line of gallery) polyline(line.map(project));
      ctx.fillStyle = rgba(C.ink3, 0.35 * galleryAlpha);
      for (const v of publicSeats) {
        const p = project(v);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.8 * dpr, 0.18 * p.s), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // the seats; in the vote (step 3) they light up row by row from the front
    const vote = reduced.matches ? 0 : voteAt(s);
    const visible = [];
    for (const seat of seats) {
      const p = project(seat.p);
      seen.r[seat.i] = 0;
      if (p) visible.push([p, seat]);
    }
    visible.sort((a, b) => b[0].z - a[0].z);
    for (const [p, seat] of visible) {
      const voted = clamp((vote * 1.6 - (seat.row / ROWS) * 0.45 - seat.rnd * 0.15) * 4);
      const lit = Math.max(voted, reduced.matches ? 0 : glow[seat.i]);
      // a flat disc on the desk: round from above, an ellipse from the lectern,
      // and never a blot, however close
      const size = 0.26 * p.s;
      const r = Math.max(0.9 * dpr, size / Math.sqrt(1 + (size / (24 * dpr)) ** 2)) * (1 + 0.3 * lit);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * flatness(seat.p), 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(blend(C.ink3, C.ink, lit), 0.78 + 0.22 * lit);
      ctx.fill();
      seen.x[seat.i] = p.x;
      seen.y[seat.i] = p.y;
      seen.r[seat.i] = r;
    }

    // the front: lectern, President, benches – far ones first
    const byDepth = boxes
      .map((b) => ({ b, d: dot(sub([b.cx, b.h / 2, b.cz], cam.pos), cam.fwd) }))
      .sort((a, b) => b.d - a.d);
    for (const { b } of byDepth) drawBox(b);

    // the debate, above it all
    if (reduced.matches) {
      ctx.lineWidth = dpr;
      ctx.strokeStyle = rgba(C.ink3, 0.5);
      for (const l of still) polyline(arcPoints(l, 0, 1, 40));
    } else {
      for (const l of lines) drawLine(l);
      for (const ring of rings) drawRing(ring);
    }

    // names of the groups, and where the lectern is
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelAlpha = 1 - 0.55 * band(s, 0.85, 1);
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
    const podium = 1 - band(s, 0.26, 0.38);
    const lp = project([0, 1.2, -0.6]);
    if (lp && podium > 0.01) {
      ctx.fillStyle = rgba(C.ink2, podium);
      ctx.font = `500 ${Math.round(12 * dpr)}px Figtree, system-ui, sans-serif`;
      ctx.fillText('Rednerpult', lp.x, lp.y - 4 * dpr);
    }
  }

  // --- the reader's hand ---------------------------------------------------------------

  let hover = -1;
  function seatAt(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    const reach = (e.pointerType === 'mouse' ? 10 : 22) * dpr;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < seats.length; i++) {
      if (!seen.r[i]) continue;
      const d = Math.hypot(seen.x[i] - x, seen.y[i] - y);
      if (d < Math.max(reach, seen.r[i] * 1.4) && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }
  // The cards and their links stay the cards' own.
  const onText = (e) => e.target.closest && e.target.closest('.step-card, a, button');
  section.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    hover = onText(e) ? -1 : seatAt(e);
    section.style.cursor = hover >= 0 ? 'pointer' : '';
  });
  section.addEventListener('pointerleave', () => {
    hover = -1;
    section.style.cursor = '';
  });
  section.addEventListener('click', (e) => {
    if (onText(e)) return;
    const i = seatAt(e);
    if (i >= 0) startTalk(i);
  });

  // --- scrolling and time --------------------------------------------------------------

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

  // Moving: the camera glides after the scroll position rather than jumping
  // with every turn of the wheel, and the debate goes on while nobody scrolls.
  // It only runs while the hall is on screen.
  let shown = progress();
  let running = false;
  let inView = true;
  let last = 0;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const target = progress();
    shown += (target - shown) * (1 - Math.exp(-dt * 6));
    if (Math.abs(target - shown) < 1e-4) shown = target;
    activate();
    tick(dt, shown);
    render(shown);
    requestAnimationFrame(loop);
  }
  function play() {
    const go = inView && !reduced.matches && !document.hidden;
    if (go && !running) {
      running = true;
      last = performance.now();
      shown = progress();
      requestAnimationFrame(loop);
    } else if (!go) {
      running = false;
      queue();
    }
  }

  // Still: one frame whenever something changes, the camera on the plan.
  let queued = false;
  function frame() {
    queued = false;
    activate();
    if (!running) render(reduced.matches ? 0 : progress());
  }
  function queue() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(frame);
    }
  }
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(stage.clientWidth * ratio);
    const h = Math.round(stage.clientHeight * ratio);
    // a phone's address bar coming and going changes nothing here
    if (w === W && h === H && ratio === dpr && keys.length) return;
    dpr = ratio;
    W = w;
    H = h;
    canvas.width = W;
    canvas.height = H;
    resolveViews();
    queue();
  }

  readColours();
  resize();
  // Without motion, a few finished exchanges, the same every time.
  for (let n = 0; n < 7; n++) {
    const talk = { at: Math.floor(rnd() * seats.length), prev: null };
    for (let hop = 0; hop < 2; hop++) {
      const to = answerer(talk, rnd);
      still.push(makeLine(talk.at, to, 0, rnd));
      talk.prev = talk.at;
      talk.at = to;
    }
  }
  // The hall is already talking when the page opens.
  for (let n = 0; n < 150; n++) tick(1 / 30, shown);
  stage.classList.add('ready');
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', resize);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    readColours();
    queue();
  });
  reduced.addEventListener?.('change', play);
  document.addEventListener('visibilitychange', play);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      play();
    }).observe(section);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
  play();
})();
