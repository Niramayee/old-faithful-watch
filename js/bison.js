/* Bison on the basin floor, from the Recraft drawings in assets/bison/: a mother grazing with her
   head low and her calf, who shift about now and then, and every few minutes a lone bison that
   wanders in from one side, grazes a while (well clear of the geyser), and wanders off again. Positions are in art units, so they stay on the ground as the art
   is resized. Drawn on one canvas under the birds'. */
window.OF = window.OF || {};

OF.Bison = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  // Each drawing: the bison's box in its 1024 square, where its hooves stand, and its length in art
  // units in the scene. All face right.
  const ART = {
    grazing: { box: [67, 246, 951, 777], feet: [509, 777], len: 60 },
    calf:    { box: [86, 480, 768, 978], feet: [427, 978], len: 33 },
    walking: { box: [73, 428, 956, 938], feet: [514, 938], len: 63 }
  };
  // Darken part-way toward the look's ink, as for the ravens (the art as drawn suits dusk).
  const TINT = { dusk: ['#3a2819', 0], dawn: ['#3a3140', 0.25], morning: ['#2e3836', 0.12], day: ['#2a3440', 0.1], night: ['#0f1626', 0.76] };

  let canvas, ctx, W = 0, H = 0, dpr = 1, look = 'dusk', ready = false, clock = 0;
  let toScreen = (ax, ay) => ({ x: ax, y: ay, s: 1 }), visibleBelow = () => Infinity;
  let walkerNext = rand(45, 120);
  const herd = [];

  function mount(el, opts = {}) {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    el.after(canvas);
    ctx = canvas.getContext('2d');
    if (opts.toScreen) toScreen = opts.toScreen;
    if (opts.visibleBelow) visibleBelow = opts.visibleBelow;
    fit();
    load().then(() => {
      // the mother and calf graze on the lower left meadow (sand; the pools are further up)
      const dir = Math.random() < 0.5 ? 1 : -1;
      const mother = { art: 'grazing', ax: rand(740, 820), ay: 838, dir, moveT: rand(4, 10), goal: null, speed: 9 };
      herd.push(mother);
      herd.push({ art: 'calf', ax: mother.ax - dir * 30, off: rand(26, 36), offT: rand(5, 10), ay: 844, dir, speed: 15, follows: mother });
      ready = true;
    });
  }
  function fit() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  // Pre-draw each bison, cropped, then keep a copy tinted for the current look.
  function load() {
    return Promise.all(Object.entries(ART).map(([name, a]) => new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        const [x0, y0, x1, y1] = a.box, w = x1 - x0, h = y1 - y0, k = 220 / w;   // ~220 px sprite
        const c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
        c.getContext('2d').drawImage(img, x0, y0, w, h, 0, 0, c.width, c.height);
        a.base = c; tint(a); ok();
      };
      img.onerror = ok;
      img.src = `assets/bison/${name}.svg`;
    })));
  }
  function tint(a) {
    if (!a.base) return;
    const c = a.c || document.createElement('canvas');
    c.width = a.base.width; c.height = a.base.height;
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(a.base, 0, 0);
    const [ink, amt] = TINT[look] || TINT.dusk;
    if (amt > 0) {
      x.globalCompositeOperation = 'source-atop';
      x.globalAlpha = amt; x.fillStyle = ink; x.fillRect(0, 0, c.width, c.height); x.globalAlpha = 1;
    }
    a.c = c;
  }
  function setLook(lk) { look = lk; Object.values(ART).forEach(tint); }


  // The calf keeps to its mother's tail side (by her flank or hip), never by her lowered head: when
  // she moves or turns round, it walks round to where her tail now is.
  function stepCalf(b, dt) {
    b.offT -= dt;
    if (b.offT <= 0) { b.off = Math.random() < 0.3 ? rand(40, 58) : rand(24, 38); b.offT = rand(4, 10); }   // sometimes lags behind
    const m = b.follows, target = m.ax - m.dir * b.off, d = target - b.ax;
    if (Math.abs(d) > 3) {
      b.goal = target; b.dir = Math.sign(d);
      b.ax += Math.sign(d) * Math.min(Math.abs(d), b.speed * dt);
    } else { b.goal = null; b.dir = m.dir; }
  }

  // Every now and then a bison shifts a little.
  function stepHerd(b, dt) {
    if (b.goal == null) {
      b.moveT -= dt;
      if (b.moveT <= 0) {
        b.moveT = rand(8, 18);
        if (Math.random() < 0.25) { b.dir = -b.dir; return; }   // just turns to face the other way
        b.goal = b.ax + (Math.random() < 0.5 ? 1 : -1) * rand(25, 70);
        b.goal = Math.max(690, Math.min(835, b.goal));   // stays on the clear sand of the lower left meadow
        if (Math.abs(b.goal - b.ax) < 10) { b.goal = null; return; }
        b.dir = b.goal > b.ax ? 1 : -1;
      }
    } else {
      const d = b.goal - b.ax, step = b.speed * dt;
      if (Math.abs(d) <= step) { b.ax = b.goal; b.goal = null; }
      else b.ax += Math.sign(d) * step;
    }
  }

  // A lone bison wanders in from one side (mostly the right, balancing the herd on the left), grazes a
  // while well clear of the geyser, and wanders back out.
  function sendWalker() {
    if (herd.some((b) => b.walker)) return;
    const left = Math.random() < 0.3;
    const edge = left ? 250 : 2180, stop = left ? rand(480, 600) : rand(1780, 1900);
    // (on the right, below the pale pool that lies at ay ≈ 782–811)
    herd.push({ art: 'walking', walker: 'in', dir: left ? 1 : -1, ax: edge, ay: left ? rand(824, 830) : rand(820, 828), speed: 14, stop, edge, pause: rand(25, 45) });
  }
  function stepWalker(b, dt) {
    if (b.walker === 'in') {
      b.ax += b.dir * b.speed * dt;
      if ((b.stop - b.ax) * b.dir <= 0) { b.ax = b.stop; b.walker = 'grazing'; }
    } else if (b.walker === 'grazing') {
      b.pause -= dt;
      b.shuffle = (b.shuffle ?? rand(4, 8)) - dt;
      if (b.shuffle <= 0) { b.shuffle = rand(5, 10); b.inch = rand(1.2, 2.5); }   // a few steps forward now and then
      if (b.inch > 0) { b.inch -= dt; b.ax += b.dir * b.speed * 0.6 * dt; }
      if (b.pause <= 0) { b.walker = 'out'; b.dir = -b.dir; b.inch = 0; }
    } else {
      b.ax += b.dir * b.speed * dt;
      if ((b.edge - b.ax) * b.dir <= 0) b.done = true;
    }
  }

  function tick(dt) {
    if (!canvas) return;
    clock += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!ready) return;
    walkerNext -= dt;
    if (walkerNext <= 0) { sendWalker(); walkerNext = rand(90, 210); }
    for (const b of herd) {
      if (b.walker) stepWalker(b, dt);
      else if (b.follows) stepCalf(b, dt);
      else stepHerd(b, dt);
    }
    for (let i = herd.length - 1; i >= 0; i--) if (herd[i].done) herd.splice(i, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // back to front, so nearer bison overlap farther ones
    for (const b of [...herd].sort((p, q) => p.ay - q.ay)) draw(b);
  }

  function draw(b) {
    const a = ART[b.art];
    if (!a.c) return;
    const p = toScreen(b.ax, b.ay);
    if (p.y > visibleBelow() + 20) return;                   // hidden behind the controls anyway
    const moving = b.walker === 'in' || b.walker === 'out' || b.inch > 0 || b.goal != null;
    const px = (a.len * p.s) / (a.box[2] - a.box[0]);        // screen px per drawing unit
    const bob = moving ? Math.abs(Math.sin(clock * 3.2 + b.ax * 0.01)) * 1.2 * p.s : 0;
    // a faint flat shadow anchors it to the ground
    ctx.save();
    ctx.globalAlpha = look === 'night' ? 0.12 : 0.16;
    ctx.fillStyle = '#1d1408';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, a.len * p.s * 0.42, a.len * p.s * 0.06, 0, 0, 6.283); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(p.x, p.y - bob);
    ctx.scale(b.dir, 1);
    if (moving) ctx.rotate(Math.sin(clock * 3.2 + b.ax * 0.01) * 0.012);
    const [x0, y0, x1, y1] = a.box;
    ctx.drawImage(a.c, (x0 - a.feet[0]) * px, (y0 - a.feet[1]) * px, (x1 - x0) * px, (y1 - y0) * px);
    ctx.restore();
  }

  return { mount, fit, setLook, tick, sendWalker, get ready() { return ready; } };
})();
