/* The geyser: Recraft poster frames (assets/geyser/) brought to life on one canvas.
   Used by the main page (js/app.js) and the test bench (eruption.html). */
window.OF = window.OF || {};

OF.Geyser = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const win = (v, a, b) => smooth((v - a) / (b - a));
  const easeOut = (v) => 1 - Math.pow(1 - clamp(v, 0, 1), 3);
  const easeInOut = (v) => { v = clamp(v, 0, 1); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };

  // ---------- geometry of the art (art units = CSS px of #stage) ----------
  const ART_W = 2384, ART_H = 1024;
  const VENT = { x: 1215, y: 738 };            // the dark opening at the top of the cone
  const H02 = VENT.y - 440;                     // water height in 02-rising
  const H03 = VENT.y - 160;                     // 03-tall-jet
  const H04 = VENT.y - 60;                      // 04-full, top of the cloud
  const JET04 = VENT.y - 370;                   // 04-full: water column below its cloud
  const JET05 = VENT.y - 505;                   // 05-declining: short column below the blown cloud
  const REVEAL_SOFT = 90;
  const BOX = { x: 760, y: 0, w: 1440, h: 840 }; // area of the art the canvas covers
  const RES = 1.25;                              // resolution of the pre-cut frame images

  // Layers, drawn in this order. Each is cut out of its frame once: only its steam/water pixels,
  // and for "split" frames only the water column (below) or only the cloud (above).
  const DEFS = {
    r02: { src: '02-rising',         box: [1000, 380, 1480, 800], water: true },
    t03: { src: '03-tall-jet',       box: [1040, 120, 1420, 800], water: true },
    j04: { src: '04-full',           box: [ 940, 300, 1560, 800], split: [320, 400, 'below'], water: true, vent: true },
    h04: { src: '04-full',           box: [ 940,  20, 1560, 500], split: [420, 480, 'above'], origin: [1235, 230] },
    j05: { src: '05-declining',      box: [1080, 440, 1600, 800], split: [470, 530, 'below'], water: true, vent: true },
    h05: { src: '05-declining',      box: [1080, 200, 2150, 600], split: [540, 590, 'above'], origin: [1380, 380] },
    c06: { src: '06-collapse-steam', box: [1060, 300, 2140, 800] },
    f07: { src: '07-steam-fading',   box: [ 940, 200, 2060, 800] }
  };
  const IDS = Object.keys(DEFS);

  // ---------- stage: the still background plus ONE canvas for everything that moves ----------
  // (Stacking many full-size masked layers exhausted GPU memory and made whole pages flash.)
  let root, stage, fxCanvas, ctx, insetFn = () => 0;
  let scale = 1, fxScale = 1, stageX = 0, stageY = 0;
  const PLUME_TOP = 40, VENT_CLEAR = 24;

  function mount(el, opts = {}) {
    root = el;
    if (opts.inset) insetFn = opts.inset;
    if (opts.look) look = opts.look;
    stage = document.createElement('div');
    Object.assign(stage.style, { position: 'absolute', left: 0, top: 0, width: ART_W + 'px', height: ART_H + 'px', transformOrigin: '0 0' });
    base = makeBase();
    fxCanvas = document.createElement('canvas');
    fxCanvas.setAttribute('aria-hidden', 'true');
    Object.assign(fxCanvas.style, { position: 'absolute', display: 'block' });
    stage.append(base, fxCanvas);
    root.append(stage);
    ctx = fxCanvas.getContext('2d');
    fit();
    ready = buildAll(look);
    return ready;
  }

  // Cover the window, keep the vent centred and above anything covering the bottom (inset), and
  // keep the plume under the top edge when possible. Any sky left above the art is filled with its colour.
  function fit() {
    const W = root.clientWidth, H = root.clientHeight, inset = insetFn(W, H) || 0;
    const cover = Math.max(W / ART_W, H / ART_H);
    const sPlume = (H - 8) / (ART_H - PLUME_TOP);
    const sVent = (inset + VENT_CLEAR) / (ART_H - VENT.y);
    scale = Math.max(W / ART_W, sVent, Math.min(cover, sPlume));
    stageX = clamp(W / 2 - VENT.x * scale, W - ART_W * scale, 0);
    stageY = H - ART_H * scale;
    stage.style.transform = `translate(${stageX}px, ${stageY}px) scale(${scale})`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fxScale = Math.max(0.3, Math.min(scale * dpr, RES));
    fxCanvas.width = Math.round(BOX.w * fxScale);
    fxCanvas.height = Math.round(BOX.h * fxScale);
    Object.assign(fxCanvas.style, { left: BOX.x + 'px', top: BOX.y + 'px', width: BOX.w + 'px', height: BOX.h + 'px' });
  }

  // ---------- load and cut the frames ----------
  const loadImg = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
  const cuts = {}, hazes = {};
  const HAZE_IDS = ['r02', 't03', 'j04', 'h04'];
  // Blur by shrinking and re-enlarging (works in every browser), then wash the colours toward steam.
  // In recoloured looks the ghost is filled evenly with the look's steam colour (no dark edge pixels).
  function makeHaze(cf, wash) {
    const k = 10, sm = document.createElement('canvas');
    sm.width = Math.max(1, Math.round(cf.c.width / k)); sm.height = Math.max(1, Math.round(cf.c.height / k));
    const sx = sm.getContext('2d'); sx.imageSmoothingQuality = 'high';
    sx.drawImage(cf.c, 0, 0, sm.width, sm.height);
    const c = document.createElement('canvas'); c.width = cf.c.width; c.height = cf.c.height;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(sm, 0, 0, c.width, c.height);
    x.drawImage(cf.c, 0, 0, c.width, c.height);      // keep a hint of the painted billows inside
    x.globalCompositeOperation = wash ? 'source-in' : 'source-atop';
    x.fillStyle = wash || 'rgba(247,242,233,0.6)'; x.fillRect(0, 0, c.width, c.height);
    return { c, x: cf.x, y: cf.y, w: cf.w, h: cf.h };
  }
  let wispSprite = null, billowSprites = [], ready = null, loaded = false;

  function cut(img, mask, d) {
    const [x0, y0, x1, y1] = d.box, w = x1 - x0, h = y1 - y0;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * RES); c.height = Math.ceil(h * RES);
    const x = c.getContext('2d');
    x.scale(RES, RES);
    x.drawImage(img, -x0, -y0, ART_W, ART_H);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(mask, -x0, -y0, ART_W, ART_H);
    if (d.split) {
      const [a, b, side] = d.split;
      const g = x.createLinearGradient(0, a - y0, 0, b - y0);
      g.addColorStop(0, side === 'below' ? 'rgba(0,0,0,0)' : '#000');
      g.addColorStop(1, side === 'below' ? '#000' : 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }
    return { c, x: x0, y: y0, w, h };
  }

  // ---------- looks (time of day, js/palette.js) ----------
  // Each look is the same art re-inked. The background cross-fades; the plume frames switch at once.
  let look = 'dusk', base = null;
  const svgText = {};
  const makeBase = () => {
    const img = new Image();
    img.alt = '';
    Object.assign(img.style, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'block', transition: 'opacity 1.6s ease' });
    return img;
  };
  async function artUrl(name, lk) {
    if (lk === 'dusk' || !window.OF.Palette) return `assets/geyser/${name}.svg`;
    if (!svgText[name]) svgText[name] = fetch(`assets/geyser/${name}.svg`).then((r) => r.text());
    const svg = OF.Palette.recolor(await svgText[name], lk, { frame: name, extras: name === '00-idle' });
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  }
  const revoke = (u) => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); };

  function swapBase(url) {
    if (!base.src) { base.src = url; return; }
    const old = base, next = makeBase();
    next.style.opacity = '0';
    next.src = url;
    stage.insertBefore(next, fxCanvas);
    base = next;
    next.decode().catch(() => {}).then(() => {
      requestAnimationFrame(() => { next.style.opacity = '1'; });
      setTimeout(() => { revoke(old.src); old.remove(); }, 1800);
    });
  }

  async function buildAll(lk) {
    const urls = {}, imgs = {}, masks = {};
    const srcs = ['00-idle', ...new Set(IDS.map((id) => DEFS[id].src))];
    await Promise.all(srcs.map(async (s) => {
      urls[s] = await artUrl(s, lk);
      imgs[s] = await loadImg(urls[s]);
      if (s !== '00-idle') masks[s] = await loadImg(`assets/geyser/mask-${s}.png`);
    }));
    const nc = {}, nh = {};
    for (const id of IDS) nc[id] = cut(imgs[DEFS[id].src], masks[DEFS[id].src], DEFS[id]);
    const washHex = lk !== 'dusk' && window.OF.Palette ? OF.Palette.tone(lk, 'steam', '#f7f2e9') : '#f7f2e9';
    const wash = `rgba(${parseInt(washHex.slice(1, 3), 16)},${parseInt(washHex.slice(3, 5), 16)},${parseInt(washHex.slice(5, 7), 16)},0.75)`;
    for (const id of HAZE_IDS) nh[id] = makeHaze(nc[id], lk === 'dusk' ? undefined : wash);
    // These read pixels, which browsers refuse when the page is opened as a file (file://).
    // Then the geyser runs without the extra idle wisps and the swelling billows.
    let nw = null, nb = [];
    try {
      const dusk = lk === 'dusk' ? imgs['00-idle'] : await loadImg('assets/geyser/00-idle.svg');
      nw = keyWisp(dusk, lk);
      nb = makeBillows(nc.h04);
      root.style.backgroundColor = skyTop(imgs['00-idle']);
    } catch { /* opened as a file */ }
    if (lk !== look) { Object.values(urls).forEach(revoke); return; }   // a newer look was asked for meanwhile
    Object.assign(cuts, nc); Object.assign(hazes, nh);
    wispSprite = nw; billowSprites = nb;
    COLORS = window.OF.Palette ? PAINTED.map((c) => OF.Palette.tone(lk, 'steam', c)) : PAINTED;
    sprayAlpha = lk === 'night' ? 0.7 : 1;
    swapBase(urls['00-idle']);
    for (const [s, u] of Object.entries(urls)) if (s !== '00-idle') revoke(u);
    loaded = true;
  }

  function setLook(lk) {
    if (lk === look) return ready;
    look = lk;
    ready = (ready || Promise.resolve()).then(() => (lk === look ? buildAll(lk) : null));
    return ready;
  }

  // fill any gap above the art with the sky's top colour
  function skyTop(img) {
    const px = document.createElement('canvas'); px.width = px.height = 1;
    const pc = px.getContext('2d'); pc.drawImage(img, -VENT.x, -1, ART_W, ART_H);
    const [r, g, b] = pc.getImageData(0, 0, 1, 1).data;
    return `rgb(${r},${g},${b})`;
  }

  // The painted idle wisp: keyed out of the painted (dusk) art — pale, unsaturated, cool, cream
  // allowed near its tip — then re-toned to the look's steam colours.
  function keyWisp(dusk, lk) {
    const R = { x: 1140, y: 520, w: 160, h: 214 };
    const grab = (img) => {
      const c = document.createElement('canvas'); c.width = R.w; c.height = R.h;
      const x = c.getContext('2d'); x.drawImage(img, -R.x, -R.y, ART_W, ART_H);
      return { c, x, id: x.getImageData(0, 0, R.w, R.h) };
    };
    const out = grab(dusk), d = out.id.data, key = d.slice();
    const toned = new Map(), hex = (i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => (v & 0xf0).toString(16).padStart(2, '0')).join('');
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % R.w, py = ((i / 4) / R.w) | 0;
      const mx = Math.max(key[i], key[i + 1], key[i + 2]), mn = Math.min(key[i], key[i + 1], key[i + 2]);
      const cool = key[i + 2] - key[i] > 4 || R.y + py < 700;
      const keep = (mn + mx) / 2 > 150 && mx - mn < 52 && cool && R.y + py < 732;
      const dx = (R.x + px - VENT.x) / 42;
      d[i + 3] = keep ? Math.round(255 * Math.exp(-dx * dx)) : 0;
      if (keep && lk !== 'dusk' && window.OF.Palette) {
        const h = hex(i);
        if (!toned.has(h)) toned.set(h, parseInt(OF.Palette.tone(lk, 'steam', h).slice(1), 16));
        const n = toned.get(h); d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255;
      }
    }
    out.x.putImageData(out.id, 0, 0);
    return { img: out.c, x: R.x, y: R.y, w: R.w, h: R.h };
  }

  // Pieces of the full plume's outer edge that swell and settle in place, keeping the crisp outline.
  function makeBillows(hc) {
    const src = hc.c;
    const sx = src.getContext('2d');
    const md = sx.getImageData(0, 0, src.width, src.height).data;
    const alphaAt = (ax, ay) => {
      const px = Math.round((ax - hc.x) * RES), py = Math.round((ay - hc.y) * RES);
      if (px < 0 || py < 0 || px >= src.width || py >= src.height) return 0;
      return md[(py * src.width + px) * 4 + 3];
    };
    const edges = [];
    for (let y = 70; y <= 350; y += 22) {
      let lo = -1, hi = -1;
      for (let x = hc.x; x < hc.x + hc.w; x += 2) if (alphaAt(x, y) > 200) { if (lo < 0) lo = x; hi = x; }
      if (lo >= 0) { edges.push({ x: lo, y, dx: -1, dy: 0 }); edges.push({ x: hi, y, dx: 1, dy: 0 }); }
    }
    for (let x = 1120; x <= 1320; x += 40) {
      for (let y = hc.y; y < hc.y + hc.h; y += 2) if (alphaAt(x, y) > 200) { edges.push({ x, y, dx: 0, dy: -1 }); break; }
    }
    return edges.map((e, n) => {
      const r = 46 + (n % 3) * 10;
      const cx = e.x - e.dx * r * 0.45, cy = e.y - e.dy * r * 0.45;
      const size = Math.ceil(r * 2);
      const c2 = document.createElement('canvas'); c2.width = c2.height = size;
      const x2 = c2.getContext('2d');
      x2.drawImage(src, (cx - r - hc.x) * RES, (cy - r - hc.y) * RES, size * RES, size * RES, 0, 0, size, size);
      x2.globalCompositeOperation = 'destination-in';
      const gx = r + e.dx * r * 0.45, gy = r + e.dy * r * 0.45;
      const g = x2.createRadialGradient(gx, gy, 0, gx, gy, r * 1.05);
      g.addColorStop(0, '#000'); g.addColorStop(0.55, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x2.fillStyle = g; x2.fillRect(0, 0, size, size);
      return { img: c2, cx, cy, r, dx: e.dx, dy: e.dy, ph: Math.random() * 6.283, per: 2.4 + Math.random() * 1.8 };
    });
  }

  // ---------- timeline ----------
  // Real Old Faithful: minutes of splashing, a climb to full height in surges, over a minute at full
  // strength, a slow decline with last sputters, then a long steam phase.
  const ORDER = ['pre', 'rise', 'full', 'die', 'collapse', 'fade'];
  const LABEL = { idle: 'Idle', pre: 'Preplay splashes', rise: 'Rising', full: 'Full eruption', die: 'Declining', collapse: 'Steam', fade: 'Steam fading' };
  const PLANS = {
    demo: { pre: 14, rise: 18, full: 30, die: 26, collapse: 12, fade: 16 },
    live: { pre: 45, rise: 30, full: 75, die: 60, collapse: 30, fade: 40 }
  };
  let plan = PLANS.demo;
  const total = () => ORDER.reduce((a, k) => a + plan[k], 0);

  function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  let splashes = [], sputters = [];
  function buildEvents() {
    let R = rng(42); splashes = [];
    for (let t = 0.8; t < plan.pre - 0.8; t += 1.2 + R() * 2.4) splashes.push({ t, z: 0.15 + (t / plan.pre) * 0.5 + R() * 0.12, fired: false });
    R = rng(7); sputters = [];
    for (let t = plan.die * 0.8; t < plan.die - 0.5; t += 0.9 + R() * 1.6) sputters.push({ t, z: 0.12 + R() * 0.25 * (1 - t / plan.die + 0.4), fired: false });
  }


  function phaseAt(t) {
    if (t <= 0) return { k: 'idle', p: 0, tl: 0 };
    let acc = 0;
    for (const k of ORDER) {
      if (t < acc + plan[k]) return { k, p: (t - acc) / plan[k], tl: t - acc };
      acc += plan[k];
    }
    return { k: 'idle', p: 0, tl: 0 };
  }
  function splashHeight(list, tl) {
    let h = 0;
    for (const s of list) {
      const d = tl - s.t;
      if (d < 0 || d > 2.2) continue;
      const up = d < 0.4 ? easeOut(d / 0.4) : 1 - smooth((d - 0.4) / 1.3);
      h = Math.max(h, H02 * s.z * up);
    }
    return h;
  }

  function stateAt(t) {
    const S = { jet: 0, spray: 0, base: 0, wisps: 0, billows: 0, rising: false };
    for (const id of IDS) S[id] = { o: 0, front: null, tx: 0, ty: 0, s: 1 };
    S.haze = {};
    const { k, p, tl } = phaseAt(t);
    S.phase = k; S.p = p;

    if (k === 'idle') {
      S.wisps = 0.55;
    } else if (k === 'pre') {
      const h = splashHeight(splashes, tl);
      S.r02.o = h > 3 ? 1 : 0; S.r02.front = VENT.y - h;
      S.f07.o = 0.18 * smooth(p);
      S.jet = h; S.base = h > 20 ? 0.4 : 0; S.wisps = 1.2;
    } else if (k === 'rise') {
      const surge = 0.045 * Math.sin(p * Math.PI * 7) * (1 - p);
      const h = H04 * clamp(Math.pow(p, 0.9) + surge, 0, 1);
      S.r02.o = 1 - win(h, H02 * 0.95, H02 * 1.35);
      S.r02.front = VENT.y - Math.min(h, H02 + 60);
      S.t03.o = win(h, H02 * 0.55, H02 * 0.95) * (1 - win(h, H03 * 0.92, H03 * 1.1));
      S.t03.front = VENT.y - Math.min(h, H03 + 80);
      const f4 = win(h, H03 * 0.78, H03 * 1.0);
      S.j04.o = S.h04.o = f4;
      S.j04.front = S.h04.front = VENT.y - h * 1.15;
      // Steam ghosts: each coming frame first appears as faint steam well above the water,
      // and the water climbs into it. They let go once the solid frame has taken over.
      const lead = 110 + 0.35 * h, breathe = 6 * Math.sin(tl * 1.3);
      const haze = (o, front, soft) => ({ o, front: front + breathe, soft, tx: 0, ty: 0, s: 1 });
      S.haze.r02 = haze(0.4 * (1 - win(h, H02 * 0.9, H02 * 1.3)), VENT.y - Math.min(h + lead, H02 + 140), 170);
      S.haze.t03 = haze(0.45 * win(h, H02 * 0.25, H02 * 0.7) * (1 - win(h, H03 * 0.95, H03 * 1.12)), VENT.y - Math.min(h + lead, H03 + 160), 200);
      const g4 = 0.5 * win(h, H02 * 0.8, H03 * 0.7) * (1 - win(p, 0.88, 1));
      S.haze.j04 = S.haze.h04 = haze(g4, VENT.y - (h * 1.15 + lead), 240);
      S.jet = Math.min(h, H03); S.spray = 0.5 + 0.5 * p; S.base = 1; S.rising = true;
      S.wisps = 0.6 * (1 - win(p, 0, 0.12)); S.billows = 1.2 * win(p, 0.85, 1);
    } else if (k === 'full') {
      S.j04.o = 1;
      S.h04.o = 1;
      S.h04.s = 1 + 0.022 * Math.sin(tl * 0.8) + 0.012 * Math.sin(tl * 2.1 + 1);
      S.h04.ty = -8 * Math.sin(tl * 0.55);
      S.jet = JET04 + 60 + 20 * Math.sin(tl * 1.7); S.spray = 1; S.base = 1; S.billows = 2.4;
    } else if (k === 'die') {
      const a = easeOut(p / 0.45);
      Object.assign(S.h04, { o: 1 - win(p, 0.15, 0.42), tx: 110 * a, ty: -40 * a, s: 1 + 0.1 * a });
      const sputter = 10 * Math.abs(Math.sin(tl * 2.9)) * (1 - p);
      Object.assign(S.j04, { o: 1 - win(p, 0.25, 0.4), ty: (JET04 - JET05) * easeInOut(p / 0.35) + sputter });
      Object.assign(S.h05, { o: win(p, 0.12, 0.35) * (1 - win(p, 0.55, 0.9)), tx: 40 * p + 60 * win(p, 0.35, 1), ty: -20 * win(p, 0.35, 1) });
      const sink05 = JET05 * easeInOut(win(p, 0.38, 0.82));
      Object.assign(S.j05, { o: win(p, 0.25, 0.38) * (1 - win(p, 0.8, 0.86)), ty: sink05 + sputter });
      S.c06.o = win(p, 0.45, 0.8);
      const hs = splashHeight(sputters, tl);
      S.r02.o = hs > 3 ? 1 : 0; S.r02.front = VENT.y - hs;
      const colH = p < 0.35 ? JET04 + 60 - (JET04 - JET05) * easeInOut(p / 0.35) : JET05 - sink05;
      S.jet = Math.max(colH, hs); S.spray = clamp(colH / (JET04 + 60), 0, 1); S.base = Math.max(S.spray, hs > 20 ? 0.4 : 0);
      S.billows = 1.4 * (1 - win(p, 0, 0.2));
    } else if (k === 'collapse') {
      S.c06.o = 1; S.c06.tx = 90 * easeOut(p);
      S.wisps = 0.9;
    } else if (k === 'fade') {
      S.c06.o = 1 - win(p, 0, 0.55); S.c06.tx = 90 + 40 * p;
      S.f07.o = win(p, 0, 0.35) * (1 - win(p, 0.5, 1)); S.f07.tx = 30 * p;
      S.wisps = 0.8;
    }
    return S;
  }

  // ---------- painting the frames ----------
  const STRIP = 10;
  const scratch = document.createElement('canvas'), scratchCtx = scratch.getContext('2d');
  let clockT = 0, shimmer = true;

  // Draws one cut frame. Unscaled frames are painted in thin horizontal strips so the rising water
  // front can fade in softly, a sinking column can disappear into the vent, and water can shimmer.
  function drawLayer(id, st) {
    drawCut(cuts[id], st, DEFS[id], REVEAL_SOFT);
  }
  // The steam ghost of a frame: same shape, blurred and whitened, running ahead of the water.
  function drawHaze(id, hz) {
    if (hz && hazes[id]) drawCut(hazes[id], hz, { vent: DEFS[id].vent }, hz.soft);
  }
  function drawCut(cf, st, d, soft) {
    if (st.o < 0.005) return;
    if (st.s !== 1) {
      const [ox, oy] = d.origin;
      ctx.save();
      ctx.globalAlpha = st.o;
      ctx.translate(ox + st.tx, oy + st.ty); ctx.scale(st.s, st.s); ctx.translate(-ox, -oy);
      ctx.drawImage(cf.c, cf.x, cf.y, cf.w, cf.h);
      ctx.restore();
      return;
    }
    const amp = !shimmer ? 0 : d.water ? 2.2 : 1.1;
    const speed = d.water ? 3.1 : 1.3;
    // Assemble the frame at full strength in a scratch canvas (shimmer strips, then smooth fades),
    // then paint it once, so strip seams never show.
    const pad = 4, w = cf.w + pad * 2, h = cf.h;
    if (scratch.width < Math.ceil(w * RES) || scratch.height < Math.ceil(h * RES)) {
      scratch.width = Math.max(scratch.width, Math.ceil(w * RES)); scratch.height = Math.max(scratch.height, Math.ceil(h * RES));
    }
    const sc = scratchCtx;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, Math.ceil(w * RES), Math.ceil(h * RES));
    // local coords: art units, origin at (cf.x - pad, cf.y)
    sc.setTransform(RES, 0, 0, RES, 0, 0);
    let lo = 0, hi = cf.h;                              // rows actually needed
    if (st.front != null) lo = Math.max(0, st.front - soft - st.ty - cf.y - 2);
    if (d.vent) hi = Math.min(hi, VENT.y + 10 - st.ty - cf.y);
    if (hi <= lo) return;
    // Rows are copied pixel for pixel and meet edge to edge. (Overlapping them by a fraction of a
    // pixel doubled the see-through steam along each seam, which showed as faint horizontal lines.)
    sc.setTransform(1, 0, 0, 1, 0, 0);
    const ROW = 12, p0 = Math.max(0, Math.floor(lo * RES)), p1 = Math.min(cf.c.height, Math.ceil(hi * RES));
    for (let py = p0 - (p0 % ROW); py < p1; py += ROW) {
      const n = Math.min(ROW, cf.c.height - py), ay = cf.y + py / RES;
      const dx = amp ? amp * Math.sin(ay * 0.045 + clockT * speed) + amp * 0.5 * Math.sin(ay * 0.11 - clockT * speed * 1.7) : 0;
      sc.drawImage(cf.c, 0, py, cf.c.width, n, (pad + dx) * RES, py, cf.c.width, n);
    }
    sc.setTransform(RES, 0, 0, RES, 0, 0);
    if (st.front != null || d.vent) {
      sc.globalCompositeOperation = 'destination-in';
      const f0 = st.front != null ? st.front - st.ty - cf.y - soft : -1e4;
      const v0 = d.vent ? VENT.y - 10 - st.ty - cf.y : 1e4;
      const fade = (yy) => smooth((yy - f0) / soft) * (1 - smooth((yy - v0) / 18));
      const ys = [0, h];
      for (let i = 0; i <= 10; i++) ys.push(f0 + soft * i / 10);
      for (let i = 0; i <= 4; i++) ys.push(v0 + 18 * i / 4);
      const g = sc.createLinearGradient(0, 0, 0, h);
      for (const yy of ys.filter((v) => v >= 0 && v <= h).sort((p, q) => p - q)) g.addColorStop(yy / h, `rgba(0,0,0,${fade(yy).toFixed(3)})`);
      sc.fillStyle = g; sc.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = st.o;
    ctx.drawImage(scratch, 0, 0, Math.ceil(w * RES), Math.ceil(h * RES), cf.x - pad + st.tx, cf.y + st.ty, Math.ceil(w * RES) / RES, Math.ceil(h * RES) / RES);
    ctx.globalAlpha = 1;
  }

  // ---------- particles ----------
  const G = 950;
  const PAINTED = ['#f6f3ec', '#f6f3ec', '#eef2f2', '#dbe8eb', '#f3e6c4'];
  let COLORS = PAINTED, sprayAlpha = 1;   // spray takes the look's steam colours
  const drops = [], wisps = [];
  let billowLevel = 0;
  const rand = (a, b) => a + Math.random() * (b - a);
  // Drops land on the mound top: a little lower the further they fall from the vent.
  const floorAt = (x) => VENT.y + 8 + Math.min(70, Math.abs(x - VENT.x) * 0.12) + rand(0, 10);
  function drop(x, y, vx, vy, r, bounce = true, mist = false) {
    drops.push({ x, y, vx, vy, r, c: COLORS[(Math.random() * COLORS.length) | 0], bounce, mist, a: mist ? rand(0.3, 0.6) : rand(0.65, 0.95), floor: floorAt(x + vx * 0.5) });
  }
  function burst(z) {
    const v0 = Math.sqrt(2 * G * H02 * z);
    for (let i = 0; i < 110; i++) drop(VENT.x + rand(-10, 10), VENT.y - 4, rand(-200, 200), -v0 * rand(0.4, 1.05), rand(0.7, 1.8));
  }

  let acc = { curtain: 0, mist: 0, base: 0, front: 0, wisp: 0 };
  function stepFx(dt, S) {
    const halfW = S.jet > 300 ? 72 : 40;
    if (S.spray > 0 && S.jet > 60) {
      acc.curtain += dt * 700 * S.spray;
      for (; acc.curtain >= 1; acc.curtain--) {
        const y = VENT.y - S.jet * rand(0.15, 0.95), side = Math.random() < 0.5 ? -1 : 1;
        drop(VENT.x + side * halfW * rand(0.5, 1.15), y, side * rand(50, 330), rand(-120, 40), rand(0.7, 1.7));
      }
      acc.mist += dt * 380 * S.spray;
      for (; acc.mist >= 1; acc.mist--) {
        const y = VENT.y - S.jet * rand(0.1, 0.9), side = Math.random() < 0.5 ? -1 : 1;
        drop(VENT.x + side * halfW * rand(0.7, 1.4), y, side * rand(30, 170) + 40, rand(-80, 10), rand(0.45, 0.9), false, true);
      }
    }
    if (S.base > 0) {
      acc.base += dt * 420 * S.base;
      for (; acc.base >= 1; acc.base--) {
        const side = Math.random() < 0.5 ? -1 : 1;
        drop(VENT.x + side * rand(4, 22), VENT.y - rand(2, 14), side * rand(60, 410), -rand(160, 540), rand(0.8, 2));
      }
    }
    if (S.rising && S.jet > 80) {
      acc.front += dt * 260;
      for (; acc.front >= 1; acc.front--) drop(VENT.x + rand(-halfW, halfW), VENT.y - S.jet + rand(0, 40), rand(-230, 230), -rand(60, 300), rand(0.8, 1.9));
    }
    if (wispSprite && S.wisps > 0) {
      acc.wisp += dt * S.wisps;
      for (; acc.wisp >= 1; acc.wisp--) wisps.push(newWisp());
    }
    let j = 0;
    for (const p of drops) {
      if (p.mist) { p.vx += (30 - p.vx) * Math.min(1, dt * 1.2); p.vy += G * 0.35 * dt; }
      else p.vy += G * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.vy > 0 && p.y > p.floor) {
        if (p.bounce && p.r > 1.3 && Math.random() < 0.25) drop(p.x, p.floor - 1, rand(-50, 50) + p.vx * 0.2, -rand(40, 100), p.r * 0.5, false);
        continue;
      }
      drops[j++] = p;
    }
    drops.length = j;
    let k = 0;
    for (const w of wisps) { w.t += dt; if (w.t < w.life) wisps[k++] = w; }
    wisps.length = k;
    billowLevel += ((S.billows > 0 ? 1 : 0) - billowLevel) * Math.min(1, dt * 1.5);
  }

  // Each wisp is the painted wisp re-shaped: a random slice of it, stretched differently, bent into
  // its own curl that keeps changing as it rises, and faded from the bottom up so it lets go of the vent.
  function newWisp() {
    const top = rand(0, 0.45);
    return {
      t: 0, life: rand(5, 9), rise: rand(90, 190), drift: rand(15, 80),
      top, len: rand(0.45, 1 - top), sx: rand(0.55, 1.35), sy: rand(0.8, 1.5), grow: rand(0.4, 1),
      curl: rand(5, 18), freq: rand(0.025, 0.06), ph: rand(0, 6.283), spin: rand(0.6, 1.6) * (Math.random() < 0.5 ? -1 : 1),
      lean: rand(-0.35, 0.35), flip: Math.random() < 0.5, peak: rand(0.35, 0.7)
    };
  }
  const wispCanvas = document.createElement('canvas'), wispCtx = wispCanvas.getContext('2d');
  const WISP_PAD = 220;   // room for the curl and lean, in sprite pixels
  function drawWisps() {
    const ws = wispSprite;
    if (!ws || !wisps.length) return;
    const W2 = ws.w + WISP_PAD * 2;
    if (wispCanvas.width !== W2 || wispCanvas.height !== ws.h) { wispCanvas.width = W2; wispCanvas.height = ws.h; }
    const wc = wispCtx;
    for (const w of wisps) {
      const k = w.t / w.life, e = easeOut(k);
      const life = Math.min(1, w.t / 1.4) * (1 - smooth((k - 0.4) / 0.6)) * w.peak;
      if (life < 0.01) continue;
      const sx = w.sx * (1 + w.grow * e), sy = w.sy * (1 + 0.5 * w.grow * e);
      const srcTop = Math.round(w.top * ws.h), srcLen = Math.min(ws.h - srcTop, Math.round(w.len * ws.h));
      if (srcLen < 4) continue;
      const baseY = VENT.y - 4 - w.rise * e;          // where the bottom of this wisp sits now
      const baseX = VENT.x + w.drift * e * e;
      // bend: each 2-px row of the slice shifts sideways, rows meeting edge to edge
      wc.globalCompositeOperation = 'source-over';
      wc.clearRect(0, 0, W2, srcLen + 1);
      const dir = w.flip ? -1 : 1;
      for (let s = 0; s < srcLen; s += 2) {
        const n = Math.min(2, srcLen - s), v = s / srcLen;
        const up = (srcLen - s) * sy;                   // height of this row above the wisp's base
        const bend = w.curl * Math.sin(up * w.freq + w.ph + w.t * w.spin) * (0.3 + v * 0.2 + (1 - v)) + w.lean * up;
        wc.drawImage(ws.img, 0, srcTop + s, ws.w, n, WISP_PAD + dir * bend / sx, s, ws.w, n);
      }
      // fade: in from the top, letting go of the vent from the bottom up as it rises
      wc.globalCompositeOperation = 'destination-in';
      const g = wc.createLinearGradient(0, 0, 0, srcLen);
      for (let i = 0; i <= 12; i++) {
        const v = i / 12;
        g.addColorStop(v, `rgba(0,0,0,${((1 - smooth((v - 0.55 + 0.35 * e) / 0.45)) * smooth(v / 0.15 + 0.2)).toFixed(3)})`);
      }
      wc.fillStyle = g; wc.fillRect(0, 0, W2, srcLen);
      ctx.save();
      ctx.globalAlpha = life;
      ctx.translate(baseX, baseY - srcLen * sy);
      ctx.scale(w.flip ? -sx : sx, sy);
      ctx.drawImage(wispCanvas, 0, 0, W2, srcLen, ws.x - VENT.x - WISP_PAD, 0, W2, srcLen);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawBillows(h) {
    if (billowLevel < 0.01 || h.o < 0.01) return;
    ctx.save();
    ctx.translate(1235 + h.tx, 230 + h.ty); ctx.scale(h.s, h.s); ctx.translate(-1235, -230);
    ctx.globalAlpha = billowLevel * h.o;
    for (const b of billowSprites) {
      const w = 0.5 - 0.5 * Math.cos(clockT * 6.283 / b.per + b.ph);
      const s = 1 + 0.12 * w, push = 7 * w;
      ctx.drawImage(b.img, b.cx + b.dx * push - b.r * s, b.cy + b.dy * push - b.r * s, b.r * 2 * s, b.r * 2 * s);
    }
    ctx.restore();
  }

  function drawDrops() {
    ctx.lineCap = 'round';
    for (const p of drops) {
      ctx.globalAlpha = p.a * sprayAlpha;
      ctx.strokeStyle = p.c; ctx.lineWidth = p.r;
      const k = p.mist ? 0.005 : 0.009;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function paint(S) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    ctx.setTransform(fxScale, 0, 0, fxScale, -BOX.x * fxScale, -BOX.y * fxScale);
    if (!loaded) return;
    drawWisps();
    for (const id of HAZE_IDS) drawHaze(id, S.haze[id]);
    for (const id of IDS) drawLayer(id, S[id]);
    drawBillows(S.h04);
    drawDrops();
  }

  // ---------- playback ----------
  let t = 0, playing = false, speed = 1, rush = 1, planName = 'demo', lastPhase = 'idle';
  const dieStart = () => plan.pre + plan.rise + plan.full;
  function markFired() {
    splashes.forEach((s) => (s.fired = t > s.t));
    sputters.forEach((s) => (s.fired = t > dieStart() + s.t));
  }
  function setPlan(name) {
    planName = name; plan = PLANS[name]; buildEvents();
    t = 0; playing = false; markFired();
  }
  function start(name) {
    if (name && name !== planName) setPlan(name);
    t = 0.001; markFired(); playing = true; rush = 1;
  }
  // Cut an eruption short: skip to where the column starts to fall, then play the rest fast.
  function windDown() {
    if (!playing) return;
    const k = phaseAt(t).k;
    if (k === 'pre') seek(total());
    else if (k === 'rise' || k === 'full') seek(dieStart());
    rush = 4.5;
  }
  function seek(v) { t = clamp(v, 0, total()); markFired(); }

  const info = { phase: 'idle', p: 0, level: 0, steam: 0, splashing: 0 };
  // Advance by dt seconds and paint. Returns what the page needs for its sign and sound.
  function tick(dt) {
    clockT += dt;
    if (playing) {
      t += dt * speed * rush;
      if (t >= total()) { t = total(); playing = false; rush = 1; }
    }
    const S = stateAt(t < total() ? t : 0);
    if (playing) {
      for (const s of splashes) if (!s.fired && t >= s.t) { s.fired = true; burst(s.z); }
      for (const s of sputters) if (!s.fired && t >= dieStart() + s.t) { s.fired = true; burst(s.z); }
    }
    stepFx(dt * (playing ? speed * rush : 1), S);
    paint(S);
    info.phase = S.phase; info.p = S.p;
    info.level = S.phase === 'pre' ? 0 : clamp(S.jet / (JET04 + 60), 0, 1);
    info.splashing = S.phase === 'pre' && S.jet > 3 ? 1 : 0;
    info.steam = clamp(Math.max(S.c06.o, S.f07.o * 0.7), 0, 1);
    if (S.phase !== lastPhase) {
      lastPhase = S.phase;
      if (api.onPhase) api.onPhase(S.phase);
    }
    return info;
  }

  // Extra steam from the vent, e.g. to carry a trivia card.
  function puff(n = 3) { if (wispSprite) for (let i = 0; i < n; i++) { const w = newWisp(); w.t = -i * 0.6; wisps.push(w); } }
  // Pre-run the particles (for screenshots, where browsers run few frames).
  function warm(sec) { for (let i = 0; i < sec * 30; i++) { clockT += 1 / 30; stepFx(1 / 30, stateAt(t)); } }
  // Where the vent and the top of the full plume are on screen, in CSS px of the root element.
  function vent() { return { x: stageX + VENT.x * scale, y: stageY + VENT.y * scale, top: stageY + (VENT.y - H04) * scale, scale }; }

  buildEvents();
  const api = {
    PLANS, LABEL, mount, fit, start, windDown, seek, setLook, setPlan, tick, puff, warm, vent, onPhase: null,
    pause() { playing = false; },
    resume() { if (t > 0 && t < total()) playing = true; else start(); },
    get ready() { return ready; },
    get loaded() { return loaded; },
    get look() { return look; },
    get playing() { return playing; },
    get time() { return t; },
    get total() { return total(); },
    get plan() { return planName; },
    get speed() { return speed; }, set speed(v) { speed = v; },
    get shimmer() { return shimmer; }, set shimmer(v) { shimmer = v; }
  };
  return api;
})();
