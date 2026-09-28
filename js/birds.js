/* Birds crossing the sky, drawn as poster-style ink silhouettes: a single raven, a pair, or a small
   loose flock now and then, flapping and gliding. Busier at dawn and dusk, none at night.
   Now and then a raven (Recraft art in assets/birds/) glides down onto the basin floor, hops and turns
   about, and flies off again.
   One full-window canvas, drawn only while birds are in the air. */
window.OF = window.OF || {};

OF.Birds = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const INK = { dawn: '#3a3140', morning: '#2e3836', day: '#2a3440', dusk: '#4b2d1e', night: null };
  // seconds between crossings
  const GAP = { dawn: [18, 40], morning: [25, 55], day: [30, 65], dusk: [18, 40], night: null };

  let canvas, ctx, W = 0, H = 0, dpr = 1, look = 'dusk', next = 4, top = () => 0, horizon = () => 0.4, ground = () => null;
  let landNext = rand(40, 90);   // seconds until a raven comes down
  let toScreen = (ax, ay) => ({ x: ax, y: ay });   // art units to screen px (the art moves on resize)
  const birds = [];

  // The landing raven's drawings: each cropped to the bird, with the point that sits on the path
  // (for the standing one, its feet). Pre-drawn once at a few sizes' worth of pixels.
  const ART = {
    stand: { src: 'raven-standing', box: [365, 502, 751, 936], anchor: [490, 930], faces: 1, h: 17 },
    glide: { src: 'raven-glide', box: [44, 86, 980, 907], anchor: [512, 500], faces: -1, w: 32 },
    flare: { src: 'raven-flare', box: [31, 296, 955, 687], anchor: [493, 490], faces: -1, w: 32 }
  };
  let artReady = false;
  function loadArt() {
    return Promise.all(Object.values(ART).map((a) => new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        const [x0, y0, x1, y1] = a.box, w = x1 - x0, h = y1 - y0, k = 160 / Math.max(w, h);   // ~160 px sprite
        const c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
        c.getContext('2d').drawImage(img, x0, y0, w, h, 0, 0, c.width, c.height);
        a.base = c; a.k = k; tintArt(a); ok();
      };
      img.onerror = ok;
      img.src = `assets/birds/${a.src}.svg`;
    }))).then(() => { artReady = Object.values(ART).every((a) => a.c); });
  }
  // The Recraft ravens are warm brown; darken them part-way toward the look's ink so they read as ravens.
  function tintArt(a) {
    if (!a.base) return;
    const c = a.c || document.createElement('canvas');
    c.width = a.base.width; c.height = a.base.height;
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(a.base, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = 0.5;
    x.fillStyle = INK[look] || '#2a2420';
    x.fillRect(0, 0, c.width, c.height);
    x.globalAlpha = 1;
    a.c = c;
  }
  // Draw one of the drawings at (x, y), facing dir, scaled so its height (h) or width (w) is that many px.
  function drawArt(a, x, y, dir, scale, rot = 0) {
    const [x0, y0, x1, y1] = a.box, bw = x1 - x0, bh = y1 - y0;
    const px = (a.h ? a.h / bh : a.w / bw) * scale;          // screen px per art unit
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir * a.faces, 1);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(a.c, (x0 - a.anchor[0]) * px, (y0 - a.anchor[1]) * px, bw * px, bh * px);
    ctx.restore();
  }

  function mount(el, opts = {}) {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    el.after(canvas);
    ctx = canvas.getContext('2d');
    if (opts.top) top = opts.top;
    if (opts.horizon) horizon = opts.horizon;
    if (opts.ground) ground = opts.ground;
    if (opts.toScreen) toScreen = opts.toScreen;
    loadArt();
    fit();
  }
  function fit() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  function setLook(lk) { look = lk; if (!INK[lk]) birds.length = 0; Object.values(ART).forEach(tintArt); }

  // A crossing: 1 raven, 2 flying together, or a loose V of 3–5, all heading the same way.
  function launch() {
    if (birds.length > 8 || !INK[look]) return;   // none at night
    const dir = Math.random() < 0.5 ? 1 : -1;
    const r = Math.random(), n = r < 0.4 ? 1 : r < 0.65 ? 2 : 3 + Math.floor(Math.random() * 3);
    const near = Math.random() < 0.45;                       // near birds are bigger and a touch faster
    const span = (near ? rand(22, 30) : rand(12, 16)) * Math.min(1.2, Math.max(0.75, W / 1300));
    const skyTop = top() + 20, skyBottom = H * horizon() - span * 1.5;
    if (skyBottom - skyTop < 70) return;                     // hardly any sky showing: no birds
    const y0 = rand(skyTop + span, skyBottom), speed = (near ? rand(70, 95) : rand(45, 65)) * (W < 720 ? 0.75 : 1);
    for (let i = 0; i < n; i++) {
      // followers trail behind in a loose V: clear of each other's wings, alternating above and below
      const back = i * span * rand(1.35, 1.6), side = i ? (i % 2 ? -1 : 1) * Math.ceil(i / 2) * span * rand(0.6, 0.8) : 0;
      birds.push({
        x: dir > 0 ? -40 - back : W + 40 + back,
        y: Math.max(skyTop, Math.min(skyBottom, y0 + side)),
        dir, speed: speed * rand(0.97, 1.03), span: span * rand(0.88, 1.08),
        ph: rand(0, 6.28), rate: rand(5.5, 7.5),              // each bird keeps its own wingbeat
        cycle: rand(0, 5), flapFor: rand(1.2, 2.4), glideFor: rand(1.4, 3.2),
        bob: rand(0, 6.28), climb: rand(-4, 4)
      });
    }
  }

  // A raven that comes down: glides in from the sky, flares, lands, stands about (hopping,
  // turning), then flies off. opts.ground() gives a spot on the basin floor in screen px (or null).
  function land() {
    const spot = ground();                                   // in art units: { ax, ay }
    if (!spot || !artReady || !INK[look] || birds.some((b) => b.state)) return false;
    const p = toScreen(spot.ax, spot.ay);
    const dir = p.x > W / 2 ? -1 : 1;                       // come in from the far side of the screen
    const sx = dir > 0 ? -60 : W + 60, sy = Math.max(top() + 40, p.y - rand(260, 360));
    birds.push({
      state: 'descend', t: 0, dur: Math.abs(p.x - sx) / rand(85, 105),
      from: { x: sx, y: sy }, spot, x: sx, y: sy, dir, speed: 0, climb: 0, span: 30,
      size: Math.min(1.25, Math.max(0.8, W / 1300)),
      ph: rand(0, 6.28), rate: 6.5, cycle: 0, flapFor: 1.6, glideFor: 2.4, bob: rand(0, 6.28),
      stay: rand(10, 20), hopT: rand(2, 4), hop: 0, art: true
    });
    return true;
  }
  // A startle (the geyser erupting) sends any raven on the ground back up.
  function startle() { for (const b of birds) if (b.state === 'ground') b.stay = 0; }

  function stepGrounded(b, dt) {
    b.t += dt;
    if (b.state === 'descend') {
      const p = Math.min(1, b.t / b.dur), e = 1 - Math.pow(1 - p, 2), to = toScreen(b.spot.ax, b.spot.ay);
      b.x = b.from.x + (to.x - b.from.x) * p;
      b.y = b.from.y + (to.y - b.from.y) * e * e;          // a long glide that steepens at the end
      b.flaring = p > 0.8;
      b.rate = p > 0.85 ? 13 : 6.5;                          // flaring flaps just before touching down
      b.flapFor = p > 0.85 ? 99 : 1.6;
      if (p >= 1) { b.state = 'ground'; b.t = 0; }
    } else if (b.state === 'ground') {
      b.hopT -= dt;
      b.hop = Math.max(0, b.hop - dt * 2.5);
      if (b.hopT <= 0) { b.hop = 1; b.hopT = rand(2, 5); if (Math.random() < 0.45) b.dir *= -1; else b.spot.ax += b.dir * rand(4, 10); }
      const at = toScreen(b.spot.ax, b.spot.ay); b.x = at.x; b.y = at.y;   // stays put on the ground if the art moves
      if (b.t > b.stay) { b.state = 'takeoff'; b.t = 0; b.flapFor = 99; b.rate = 12; b.flaring = true; b.dir = Math.random() < 0.5 ? 1 : -1; }
    } else if (b.state === 'takeoff') {
      const up = Math.min(1, b.t / 1.2);
      b.x += b.dir * (30 + 60 * up) * dt;
      b.y -= (90 - 40 * up) * dt;
      if (b.t > 1.5) { b.state = null; b.flaring = false; b.speed = 85; b.climb = -18; b.rate = 6.5; b.flapFor = 1.6; b.cycle = 0; }
    }
  }

  // The landing raven, in the Recraft drawings: standing (hopping, turning about), or flying
  // (glide drawing, switching to the raised-wing drawing while flapping, flaring or taking off).
  function drawRaven(b, t) {
    if (b.state === 'ground') {
      const hopY = -Math.sin(b.hop * Math.PI) * 5 * b.size;
      drawArt(ART.stand, b.x, b.y + hopY, b.dir, b.size);
      return;
    }
    const flapping = b.flaring || ((b.cycle + t) % (b.flapFor + b.glideFor)) < b.flapFor;
    const up = flapping && Math.sin(b.ph + t * b.rate) > 0;
    drawArt(up || b.flaring ? ART.flare : ART.glide, b.x, b.y + Math.sin(t * 1.6 + b.bob) * 1.5, b.dir, b.size);
  }

  // Wing angle: flapping for a while, then a glide with wings held slightly raised.
  function wing(b, t) {
    const c = (b.cycle + t) % (b.flapFor + b.glideFor);
    const flapping = c < b.flapFor;
    const s = Math.sin(b.ph + t * b.rate);
    return flapping ? s : 0.25 + 0.05 * Math.sin(t * 1.3 + b.ph);
  }

  // Two tapered wings with an arched wrist, meeting at a small body. The wings never thin to a
  // hairline and only dip a little below the body, so every pose still reads as a bird.
  function drawBird(b, t) {
    const a = Math.max(-0.35, wing(b, t));   // -0.35 (down) .. 1 (up)
    const s = b.span / 2, L = a * s * 0.5, raise = s * 0.08;
    const thick = Math.max(1.6, s * 0.16);
    ctx.save();
    ctx.translate(b.x, b.y + Math.sin(t * 1.6 + b.bob) * 1.5);
    ctx.scale(b.dir, 1);
    // each wing and the body filled on their own, so overlaps can never cancel into a hollow
    for (const side of [-1, 1]) {
      const tipX = side * s, tipY = -L - raise;
      const wristX = side * s * 0.45, wristY = -L * 0.85 - s * 0.16;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.06, -s * 0.02);
      ctx.quadraticCurveTo(wristX, wristY, tipX, tipY);
      ctx.quadraticCurveTo(wristX, wristY + thick * 1.6, side * s * 0.06, thick * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, s * 0.02, s * 0.13, Math.max(1.2, s * 0.08), 0, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  let clock = 0, painted = false;
  function tick(dt) {
    if (!canvas) return;
    clock += dt;
    const ink = INK[look];
    if (ink) {
      next -= dt;
      if (next <= 0) { launch(); const g = GAP[look]; next = rand(g[0], g[1]); }
    }
    if (ink) { landNext -= dt; if (landNext <= 0) { land(); landNext = rand(70, 150); } }
    for (const b of birds) {
      if (b.state) stepGrounded(b, dt);
      else { b.x += b.dir * b.speed * dt; b.y += b.climb * dt; }
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      if (!b.state && (b.x < -120 || b.x > W + 120 || b.y < -80)) birds.splice(i, 1);
    }
    if (!birds.length && !painted) return;   // nothing in the air: leave the canvas alone
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    painted = birds.length > 0;
    if (!painted) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = ink || '#000';
    ctx.globalAlpha = look === 'dusk' ? 0.8 : 0.85;
    for (const b of birds) {
      if (b.art) { ctx.globalAlpha = 1; drawRaven(b, clock); ctx.globalAlpha = look === 'dusk' ? 0.8 : 0.85; }
      else drawBird(b, clock);
    }
    ctx.globalAlpha = 1;
  }

  return { mount, fit, setLook, tick, launch, land, startle };
})();
