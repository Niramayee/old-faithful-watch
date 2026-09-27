/* The illustrated scene: sky, landscape, trees, steam and eruption particles, bison, ravens, a hawk,
   and the people on the benches. Everything is drawn in code onto one canvas. */
window.OF = window.OF || {};

OF.Scene = (() => {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (R, a) => a[(R() * a.length) | 0];
  const hexArr = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixArr = (A, B, t) => A.map((v, i) => lerp(v, B[i], t));
  const css = (a, al = 1) => `rgba(${a.map(Math.round).join(',')},${al})`;

  const cv = document.getElementById('scene');
  const ctx = cv.getContext('2d');
  const wc = document.createElement('canvas');          // world layer, tinted for time of day
  const wx = wc.getContext('2d');

  let W = 0, H = 0, DPR = 1, u = 1, MAXP = 1400, qual = 1;
  const G = {};
  let backL, frontL, fgL;
  let midTrees = [], nearTrees = [], stars = [], clouds = [], people = [];
  let T = 0, wind = 0.5, gust = 0, gustT = 8;
  let skyHourOverride = null;

  const state = {
    eruption: null,        // active eruption timeline
    steamBoost: 0.2,       // extra idle steam, high right after an eruption
    splashing: 0,          // 0..1, drives the preplay hiss
    onPhase: null,         // callback(phase, eruption)
  };

  // ---------- sprites ----------
  function sprite(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return c;
  }
  const puffW = sprite(64, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(252,253,255,.55)'], [1, 'rgba(255,255,255,0)']]);
  const puffG = sprite(64, [[0, 'rgba(214,220,226,1)'], [0.4, 'rgba(206,213,220,.55)'], [1, 'rgba(206,213,220,0)']]);
  const dropS = sprite(16, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(236,246,252,.8)'], [1, 'rgba(236,246,252,0)']]);

  function layer() {
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * DPR);
    c.height = Math.ceil(H * DPR);
    const x = c.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return [c, x];
  }

  // ---------- geometry ----------
  function resize() {
    W = cv.clientWidth || innerWidth;
    H = cv.clientHeight || innerHeight;
    const d = window.devicePixelRatio || 1;
    DPR = Math.min(d, 2);
    if (W * H * DPR * DPR > 4.2e6) DPR = Math.max(1, Math.sqrt(4.2e6 / (W * H)));
    cv.width = wc.width = Math.ceil(W * DPR);
    cv.height = wc.height = Math.ceil(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    wx.setTransform(DPR, 0, 0, DPR, 0, 0);

    u = Math.min(W / 1000, H / 620);
    // Portrait screens get a compressed landscape so the geyser sits above the sign.
    const tall = W / H < 0.8;
    G.horizon = H * (tall ? 0.35 : 0.47);
    G.basinTop = H * (tall ? 0.43 : 0.585);
    G.vx = W * 0.5;
    G.vy = H * (tall ? 0.5 : 0.665);
    G.boardTop = H * (tall ? 0.66 : 0.875);
    G.coneW = Math.max(W * 0.03, u * 34);
    G.coneH = H * 0.03;
    G.ventTop = G.vy - G.coneH * 0.9;
    G.maxH = Math.min(H * 0.55, G.ventTop - H * 0.07);
    G.g = G.maxH * 1.05;
    G.pu = G.maxH / 460;   // particle unit: steam and water scale with the column, not the screen width
    G.benchY = G.boardTop + (H - G.boardTop) * 0.42;
    G.moundRx = Math.min(W * 0.2, H * 0.42);

    MAXP = W * H > 900000 ? 1700 : 1000;
    if (RM) MAXP = Math.round(MAXP * 0.5);
    qual = MAXP / 1700;

    buildBack();
    buildFront();
    buildForeground();
    buildTrees();
    buildSky();
    placeAnimals();
  }

  // Ground positions are authored as fractions of a landscape screen; gy maps them onto the current basin.
  const gy = (f) => G.basinTop + ((f - 0.585) / 0.29) * (G.boardTop - G.basinTop);
  const depth = (y) => 0.55 + 0.75 * clamp((y - G.basinTop) / (G.boardTop - G.basinTop), 0, 1);

  // ---------- static layers ----------
  function treeTop(c, x, y, h, col) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x, y - h);
    c.lineTo(x - h * 0.22, y);
    c.lineTo(x + h * 0.22, y);
    c.closePath();
    c.fill();
  }

  function buildBack() {
    let c;
    [backL, c] = layer();
    const R = rng(7);

    // distant ridge
    const ridgeY = (x) => G.horizon - H * 0.055 - H * 0.04 *
      (Math.sin((x / W) * 5.1 + 1.3) * 0.6 + Math.sin((x / W) * 11.7 + 0.4) * 0.3 + Math.sin((x / W) * 23 + 2) * 0.1);
    let g = c.createLinearGradient(0, G.horizon - H * 0.12, 0, G.basinTop);
    g.addColorStop(0, '#8ea6b6');
    g.addColorStop(1, '#6f8a8c');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) c.lineTo(x, ridgeY(x));
    c.lineTo(W, H);
    c.fill();

    // far forest band on the ridge's lower slopes
    const farY = (x) => G.horizon + H * 0.012 * Math.sin((x / W) * 7 + 0.5) + H * 0.008 * Math.sin((x / W) * 19);
    c.fillStyle = '#4a685b';
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) c.lineTo(x, farY(x));
    c.lineTo(W, H);
    c.fill();
    for (let x = -4; x < W + 4; x += (2.5 + R() * 3.5) * Math.max(0.6, u)) {
      const h = H * (0.012 + R() * 0.017);
      if (R() < 0.06) {
        c.strokeStyle = '#8f8a80'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, farY(x)); c.lineTo(x, farY(x) - h * 1.2); c.stroke();
      } else treeTop(c, x, farY(x) + 2, h, pick(R, ['#3f5d50', '#4a6a5b', '#39574a', '#44624f']));
    }

    // Observation Point hill behind the geyser
    const hc = W * 0.36, hw = W * 0.34, hh = H * 0.17;
    const hillY = (x) => {
      const d = (x - hc) / hw;
      if (Math.abs(d) >= 1) return G.basinTop;
      return G.basinTop - hh * Math.pow(Math.cos((d * Math.PI) / 2), 1.2) + H * 0.004 * Math.sin(x * 0.05);
    };
    c.fillStyle = '#365544';
    c.beginPath();
    c.moveTo(hc - hw, G.basinTop);
    for (let x = hc - hw; x <= hc + hw; x += 6) c.lineTo(x, hillY(x));
    c.lineTo(hc + hw, G.basinTop);
    c.fill();
    const inner = Math.round(260 * Math.max(0.5, W / 1400));
    for (let i = 0; i < inner; i++) {
      const x = hc - hw + R() * hw * 2;
      const top = hillY(x);
      if (top >= G.basinTop - 2) continue;
      const y = lerp(top + 6, G.basinTop, Math.pow(R(), 0.8));
      treeTop(c, x, y, H * (0.012 + R() * 0.016), pick(R, ['#2f4d3d', '#3a5a47', '#324f40', '#3f604a']));
    }
    for (let x = hc - hw; x < hc + hw; x += (3 + R() * 4) * Math.max(0.6, u)) {
      const top = hillY(x);
      if (top < G.basinTop - 4) treeTop(c, x, top + 3, H * (0.014 + R() * 0.02), pick(R, ['#2f4d3d', '#3a5a47', '#34533f']));
    }

    // dark band that the animated tree line stands in front of
    c.fillStyle = '#2c4636';
    c.fillRect(0, G.basinTop - H * 0.028, W, H * 0.06);
  }

  function buildFront() {
    let c;
    [frontL, c] = layer();
    const R = rng(11);
    const top = (x) => G.basinTop + H * 0.004 * Math.sin(x * 0.02) + H * 0.003 * Math.sin(x * 0.051);

    // sinter flats
    let g = c.createLinearGradient(0, G.basinTop, 0, H);
    g.addColorStop(0, '#cfc7b1');
    g.addColorStop(1, '#b8ad92');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) c.lineTo(x, top(x));
    c.lineTo(W, H);
    c.fill();

    // autumn meadows on both sides, with ragged edges where grass meets sinter
    const span = gy(0.9) - G.basinTop;
    const edgeL = (y) => {
      const t = (y - G.basinTop) / span;
      return lerp(W * 0.36, W * 0.18, t * t * (3 - 2 * t)) + W * 0.018 * Math.sin(y * 0.09) + W * 0.01 * Math.sin(y * 0.23 + 1);
    };
    const edgeR = (y) => {
      const t = (y - G.basinTop) / span;
      return lerp(W * 0.65, W * 0.83, t * t * (3 - 2 * t)) + W * 0.016 * Math.sin(y * 0.08 + 2) + W * 0.01 * Math.sin(y * 0.21);
    };
    c.fillStyle = '#9d9860';
    for (const [edge, x0] of [[edgeL, 0], [edgeR, W]]) {
      c.beginPath();
      c.moveTo(x0, G.basinTop - 2);
      for (let y = G.basinTop - 2; y <= gy(0.9); y += 3) c.lineTo(edge(y), y);
      c.lineTo(x0, gy(0.9));
      c.fill();
    }
    c.fillStyle = 'rgba(157,152,96,.55)';
    for (let i = 0; i < 70; i++) {
      const y = lerp(G.basinTop + 4, gy(0.9), R());
      const left = R() < 0.5;
      const x = (left ? edgeL(y) : edgeR(y)) + (left ? 1 : -1) * R() * W * 0.02;
      c.beginPath(); c.ellipse(x, y, W * (0.006 + R() * 0.018), H * (0.003 + R() * 0.004), 0, 0, TAU); c.fill();
    }
    const strokes = Math.round(900 * Math.max(0.5, (W * H) / 1.2e6));
    c.lineWidth = Math.max(1, u * 1.1);
    for (let i = 0; i < strokes; i++) {
      const side = R() < 0.5;
      const y = lerp(G.basinTop + 3, gy(0.9), Math.pow(R(), 1.3));
      const edge = side ? edgeL(y) : edgeR(y);
      const x = side ? R() * edge : edge + R() * (W - edge);
      const len = (2 + R() * 5) * depth(y) * u;
      c.strokeStyle = pick(R, ['#8a8650', '#b3ab70', '#a19b5e', '#7f7c4a']);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 2, y - len); c.stroke();
    }

    // pale patches of sinter
    for (let i = 0; i < 14; i++) {
      c.fillStyle = `rgba(232,227,214,${0.25 + R() * 0.3})`;
      c.beginPath();
      c.ellipse(W * (0.3 + R() * 0.4), lerp(G.vy, gy(0.86), R()), W * (0.03 + R() * 0.08), H * (0.006 + R() * 0.012), 0, 0, TAU);
      c.fill();
    }

    // far boardwalk loop behind the geyser
    const bwY = G.basinTop + H * 0.022;
    c.strokeStyle = '#8b7156';
    c.lineWidth = Math.max(1.5, u * 2.2);
    c.beginPath(); c.moveTo(W * 0.08, bwY + H * 0.01); c.quadraticCurveTo(W * 0.5, bwY - H * 0.006, W * 0.92, bwY + H * 0.01); c.stroke();
    c.lineWidth = 1;
    for (let x = W * 0.1; x < W * 0.9; x += 18 * Math.max(0.6, u)) {
      const t = (x - W * 0.08) / (W * 0.84);
      const y = (1 - t) * (1 - t) * (bwY + H * 0.01) + 2 * (1 - t) * t * (bwY - H * 0.006) + t * t * (bwY + H * 0.01);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 4 * u); c.stroke();
    }

    // runoff channels: soft, braided streaks coloured by microbial mats, widening as they spread
    const my = G.vy + H * 0.012;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const sx = G.vx + side * G.moundRx * (0.2 + R() * 0.6);
      const sy = my + H * 0.018;
      const ex = sx + side * W * (0.03 + R() * 0.09), ey = sy + H * (0.07 + R() * 0.1);
      const c1x = sx + side * W * (0.01 + R() * 0.03), c1y = sy + H * 0.04;
      const c2x = ex - side * W * (0.02 + R() * 0.03), c2y = ey - H * 0.03;
      const cols = [pick(R, ['#d98c42', '#c9783c', '#e0ad50']), pick(R, ['#9a5a30', '#8a5d3a', '#a8683a'])];
      for (let k = 0; k <= 40; k++) {
        const t = k / 40, it = 1 - t;
        const x = it * it * it * sx + 3 * it * it * t * c1x + 3 * it * t * t * c2x + t * t * t * ex + Math.sin(t * 9 + i) * W * 0.004;
        const y = it * it * it * sy + 3 * it * it * t * c1y + 3 * it * t * t * c2y + t * t * t * ey;
        const w = W * (0.003 + t * 0.009) * (0.8 + 0.4 * Math.sin(t * 13 + i));
        c.globalAlpha = 0.1;
        c.fillStyle = cols[k % 2];
        c.beginPath(); c.ellipse(x, y, w * 1.8, w * 0.5, 0, 0, TAU); c.fill();
        c.globalAlpha = 0.22;
        c.fillStyle = cols[0];
        c.beginPath(); c.ellipse(x, y, w * 0.6, w * 0.2, 0, 0, TAU); c.fill();
      }
      c.globalAlpha = 0.18;
      c.fillStyle = cols[1];
      c.beginPath(); c.ellipse(ex, ey + H * 0.004, W * 0.03, H * 0.008, 0, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;

    // geyser mound
    c.fillStyle = '#c8c0ab';
    c.beginPath(); c.ellipse(G.vx, my + H * 0.006, G.moundRx * 1.02, H * 0.038, 0, 0, TAU); c.fill();
    c.fillStyle = '#e3dfd3';
    c.beginPath(); c.ellipse(G.vx, my, G.moundRx, H * 0.034, 0, 0, TAU); c.fill();
    c.fillStyle = '#ece9e0';
    c.beginPath(); c.ellipse(G.vx - G.moundRx * 0.1, my - H * 0.006, G.moundRx * 0.6, H * 0.018, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(201,120,60,.35)';
    c.beginPath(); c.ellipse(G.vx + G.moundRx * 0.3, my + H * 0.012, G.moundRx * 0.35, H * 0.01, 0.05, 0, TAU); c.fill();

    // cone
    const cw = G.coneW, ch = G.coneH;
    c.fillStyle = '#b3a993';
    c.beginPath();
    c.moveTo(G.vx - cw, G.vy + 2);
    c.bezierCurveTo(G.vx - cw * 0.8, G.vy - ch * 0.4, G.vx - cw * 0.55, G.vy - ch * 0.95, G.vx - cw * 0.25, G.vy - ch);
    c.lineTo(G.vx + cw * 0.3, G.vy - ch * 0.92);
    c.bezierCurveTo(G.vx + cw * 0.6, G.vy - ch * 0.8, G.vx + cw * 0.85, G.vy - ch * 0.3, G.vx + cw, G.vy + 2);
    c.closePath();
    c.fill();
    c.fillStyle = '#d6cfbe';
    c.beginPath();
    c.moveTo(G.vx - cw * 0.9, G.vy + 1);
    c.bezierCurveTo(G.vx - cw * 0.7, G.vy - ch * 0.5, G.vx - cw * 0.5, G.vy - ch * 0.9, G.vx - cw * 0.25, G.vy - ch);
    c.lineTo(G.vx - cw * 0.1, G.vy - ch * 0.5);
    c.lineTo(G.vx - cw * 0.3, G.vy + 1);
    c.fill();
    c.fillStyle = '#5d5448';
    c.beginPath(); c.ellipse(G.vx, G.ventTop, cw * 0.28, ch * 0.16, 0, 0, TAU); c.fill();

    // two small hot springs
    G.pools = [
      { x: W * 0.22, y: gy(0.705), rx: W * 0.035, ry: H * 0.01 },
      { x: W * 0.79, y: gy(0.79), rx: W * 0.045, ry: H * 0.013 }
    ];
    for (const p of G.pools) {
      c.fillStyle = '#c98a45';
      c.beginPath(); c.ellipse(p.x, p.y, p.rx * 1.25, p.ry * 1.5, 0, 0, TAU); c.fill();
      c.fillStyle = '#e0d6bd';
      c.beginPath(); c.ellipse(p.x, p.y, p.rx * 1.08, p.ry * 1.22, 0, 0, TAU); c.fill();
      const pg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rx);
      pg.addColorStop(0, '#2f7fa3');
      pg.addColorStop(0.7, '#56b3c2');
      pg.addColorStop(1, '#9fd2b0');
      c.fillStyle = pg;
      c.beginPath(); c.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU); c.fill();
    }
  }

  function buildForeground() {
    let c;
    [fgL, c] = layer();
    // boardwalk planks in perspective
    c.fillStyle = '#6d5039';
    c.fillRect(0, G.boardTop, W, H - G.boardTop);
    c.fillStyle = '#846246';
    c.fillRect(0, G.boardTop, W, Math.max(2, H * 0.004));
    c.strokeStyle = '#563f2c';
    c.lineWidth = 1;
    let y = G.boardTop + H * 0.01, step = H * 0.008;
    while (y < H) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      y += step; step *= 1.35;
    }
    // edge rail posts at the front of the boardwalk
    c.fillStyle = '#4c3624';
    for (let x = 8; x < W; x += 90 * Math.max(0.5, u)) c.fillRect(x, G.boardTop - 12 * u, 4 * u, 14 * u);
    c.fillRect(0, G.boardTop - 12 * u, W, 3 * u);
  }

  function buildTrees() {
    const R = rng(21);
    midTrees = [];
    let x = -12;
    while (x < W + 12) {
      const snag = R() < 0.1;
      const h = H * (0.075 + R() * 0.075) * (snag ? 0.8 : 1);
      midTrees.push({
        x, y: G.basinTop + H * (0.004 + R() * 0.012), h, snag,
        tiers: snag ? 0 : 4 + ((R() * 3) | 0), crown: 0.5 + R() * 0.18, wide: 0.8 + R() * 0.45,
        c1: pick(R, ['#2d4a39', '#32503d', '#2a4535']), c2: pick(R, ['#38584a', '#3b5c44', '#335240']),
        trunk: snag ? '#8f897d' : '#4a3a2c', ph: R() * TAU, flex: 0.7 + R() * 0.6
      });
      x += (W / 70) * (0.35 + R() * 1.3);
    }
    midTrees.sort((a, b) => a.y - b.y);

    const base = G.boardTop - 10 * u;
    const mk = (fx, fh, snag = false) => ({
      x: W * fx, y: base, h: H * fh, snag, tiers: snag ? 0 : 9, crown: 0.62, wide: 1,
      c1: '#203829', c2: '#28432f', trunk: snag ? '#8a8277' : '#3b2c20', ph: R() * TAU, flex: 1
    });
    nearTrees = W < 700
      ? [mk(-0.03, 0.56), mk(1.03, 0.58)]
      : [mk(-0.006, 0.62), mk(0.05, 0.5), mk(0.095, 0.33, true), mk(1.0, 0.6), mk(0.955, 0.47)];
  }

  function drawPine(c, t, sway) {
    const { x, y, h } = t;
    const tip = sway * h;
    c.strokeStyle = t.trunk;
    c.lineWidth = Math.max(1, h * 0.022);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + tip * 0.3, y - h * 0.5, x + tip, y - h);
    c.stroke();
    if (t.snag) {
      c.lineWidth = Math.max(1, h * 0.01);
      for (const [f, d] of [[0.55, -1], [0.7, 1], [0.82, -1]]) {
        const bx = x + tip * Math.pow(f, 1.6), by = y - h * f;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + d * h * 0.06, by - h * 0.03); c.stroke();
      }
      return;
    }
    const n = t.tiers;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const hy = 0.98 - t.crown * f;
      const cx = x + tip * Math.pow(hy, 1.6);
      const cy = y - h * hy;
      const w = h * (0.03 + 0.07 * f) * t.wide;
      const th = h * (0.06 + 0.035 * f);
      const droop = sway * h * 0.04 * hy;
      c.fillStyle = i % 2 ? t.c1 : t.c2;
      c.beginPath();
      c.moveTo(cx, cy - th * 0.65);
      c.quadraticCurveTo(cx - w * 0.35, cy, cx - w + droop, cy + th * 0.45);
      c.quadraticCurveTo(cx, cy + th * 0.2, cx + w + droop, cy + th * 0.45);
      c.quadraticCurveTo(cx + w * 0.35, cy, cx, cy - th * 0.65);
      c.fill();
    }
  }

  // ---------- sky ----------
  const SKY = [
    { h: 0, top: '#070b1a', bot: '#1a2344', tint: '#0b1230', ta: 0.62, st: 1 },
    { h: 5.2, top: '#0b1226', bot: '#27325a', tint: '#0e1638', ta: 0.58, st: 0.9 },
    { h: 6.6, top: '#34466f', bot: '#e9a47c', tint: '#8a6a80', ta: 0.3, st: 0.15 },
    { h: 7.8, top: '#5d93c8', bot: '#f1d6b8', tint: '#e8b890', ta: 0.1, st: 0 },
    { h: 9.8, top: '#3f84c9', bot: '#cfe3ef', tint: '#ffffff', ta: 0, st: 0 },
    { h: 16.8, top: '#4488c8', bot: '#d5e5ec', tint: '#ffffff', ta: 0, st: 0 },
    { h: 18.5, top: '#4f78b0', bot: '#f3c38c', tint: '#e89a5a', ta: 0.16, st: 0 },
    { h: 19.4, top: '#34406f', bot: '#ef8f5e', tint: '#9a5a60', ta: 0.3, st: 0.05 },
    { h: 20.4, top: '#141c3a', bot: '#3b3a64', tint: '#141c40', ta: 0.52, st: 0.6 },
    { h: 24, top: '#070b1a', bot: '#1a2344', tint: '#0b1230', ta: 0.62, st: 1 }
  ].map((k) => ({ ...k, top: hexArr(k.top), bot: hexArr(k.bot), tint: hexArr(k.tint) }));

  const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  function parkHour() {
    const p = hourFmt.formatToParts(new Date());
    const h = +p.find((x) => x.type === 'hour').value % 24;
    const m = +p.find((x) => x.type === 'minute').value;
    return h + m / 60;
  }

  function skyAt(h) {
    let i = 0;
    while (i < SKY.length - 2 && SKY[i + 1].h <= h) i++;
    const a = SKY[i], b = SKY[i + 1];
    const t = clamp((h - a.h) / (b.h - a.h), 0, 1);
    return { h, top: mixArr(a.top, b.top, t), bot: mixArr(a.bot, b.bot, t), tint: mixArr(a.tint, b.tint, t),
      ta: lerp(a.ta, b.ta, t), st: lerp(a.st, b.st, t) };
  }

  function buildSky() {
    const R = rng(3);
    stars = Array.from({ length: 170 }, () => ({ x: R() * W, y: Math.pow(R(), 1.4) * G.horizon, r: 0.4 + R() * 1.2, ph: R() * TAU, sp: 0.5 + R() * 2 }));
    // Poster-style clouds: stacked domes with a flat base.
    clouds = Array.from({ length: 4 }, () => {
      const n = 5 + ((R() * 4) | 0);
      const puffs = Array.from({ length: n }, (_, k) => {
        const f = k / (n - 1) - 0.5;
        const r = 12 + (1 - Math.abs(f) * 1.6) * (14 + R() * 16);
        return { dx: f * 170 + (R() - 0.5) * 16, dy: -r * 0.35 - R() * 6, r };
      });
      return { x: R() * W, y: G.horizon * (0.2 + R() * 0.4), s: u * (0.6 + R() * 0.6), sp: 0.4 + R() * 0.6, puffs };
    });
  }

  function drawSky(c, k) {
    const g = c.createLinearGradient(0, 0, 0, G.basinTop);
    g.addColorStop(0, css(k.top));
    g.addColorStop(1, css(k.bot));
    c.fillStyle = g;
    c.fillRect(0, 0, W, G.basinTop + 2);

    if (k.st > 0.01) {
      c.fillStyle = '#f4f6ff';
      for (const s of stars) {
        c.globalAlpha = k.st * (0.55 + 0.45 * Math.sin(T * s.sp + s.ph));
        c.fillRect(s.x, s.y, s.r, s.r);
      }
      c.globalAlpha = 1;
    }

    const h = k.h;
    if (h > 6.8 && h < 19.6) {
      const p = (h - 7.1) / (19.2 - 7.1);
      const sx = lerp(W * 0.06, W * 0.94, p);
      const sy = G.horizon - Math.sin(Math.PI * clamp(p, 0, 1)) * H * 0.36 + H * 0.02;
      const low = 1 - Math.sin(Math.PI * clamp(p, 0, 1));
      const glow = c.createRadialGradient(sx, sy, 0, sx, sy, u * 120);
      glow.addColorStop(0, `rgba(255,240,200,${0.55 + low * 0.2})`);
      glow.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = glow;
      c.fillRect(sx - u * 120, sy - u * 120, u * 240, u * 240);
      c.fillStyle = low > 0.6 ? '#ffd9a0' : '#fff6de';
      c.beginPath(); c.arc(sx, sy, u * 16, 0, TAU); c.fill();
    } else if (k.st > 0.3) {
      const mx = W * 0.8, my = H * 0.13;
      const mg = c.createRadialGradient(mx, my, 0, mx, my, u * 60);
      mg.addColorStop(0, 'rgba(230,236,255,.35)');
      mg.addColorStop(1, 'rgba(230,236,255,0)');
      c.fillStyle = mg;
      c.fillRect(mx - u * 60, my - u * 60, u * 120, u * 120);
      c.fillStyle = '#eef0f6';
      c.beginPath(); c.arc(mx, my, u * 11, 0, TAU); c.fill();
      c.fillStyle = css(k.top);
      c.beginPath(); c.arc(mx + u * 5, my - u * 3, u * 10, 0, TAU); c.fill();
    }

    const night = k.st;
    const body = css(mixArr([255, 253, 248], k.bot, 0.12 + night * 0.55), lerp(0.96, 0.35, night));
    const shade = css(mixArr([236, 240, 246], k.top, 0.3 + night * 0.4), lerp(0.92, 0.3, night));
    for (const cl of clouds) {
      const s = cl.s;
      c.save();
      c.beginPath();
      c.rect(cl.x - 140 * s, cl.y - 120 * s, 280 * s, 120 * s);
      c.clip();
      c.fillStyle = shade;
      c.beginPath();
      for (const p of cl.puffs) { c.moveTo(cl.x + (p.dx + p.r) * s, cl.y + p.dy * s); c.arc(cl.x + p.dx * s, cl.y + p.dy * s, p.r * s, 0, TAU); }
      c.fill();
      c.fillStyle = body;
      c.beginPath();
      for (const p of cl.puffs) {
        const r = p.r * 0.9 * s, x = cl.x + p.dx * s - p.r * 0.1 * s, y = cl.y + p.dy * s - p.r * 0.2 * s;
        c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
      }
      c.fill();
      c.restore();
    }
  }

  // ---------- particles ----------
  // type 0 steam, 1 water, 2 dust
  const P = [];
  function add(type, x, y, vx, vy, r, gr, max, a, drag, buoy, grey) {
    if (P.length >= MAXP) return null;
    const p = { type, x, y, vx, vy, r, gr, life: 0, max, a, drag, buoy, grey, gy: 0 };
    P.push(p);
    return p;
  }
  function steam(x, y, vx, vy, r, gr, max, a, drag = 0.3, buoy = 5, grey = Math.random() < 0.3) {
    return add(0, x, y, vx, vy, r, gr, max, a, drag, buoy, grey);
  }
  function dust(x, y) {
    for (let i = 0; i < 5; i++) add(2, x + rand(-4, 4) * u, y, rand(-18, 18) * u, -rand(8, 28) * u, rand(1.5, 3.5) * u, 4 * u, rand(0.6, 1.2), 0.5, 0, 0);
  }

  function updateParticles(dt) {
    const wpx = wind * G.pu * 70;
    const ground = G.vy + H * 0.012;
    let j = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      if (p.type === 0) {
        const hf = clamp((G.ventTop - p.y) / G.maxH, 0, 1.3);
        const target = wpx * (0.2 + 1.2 * hf);
        p.vx += (target - p.vx) * Math.min(1, dt * 0.8);
        p.vy -= p.buoy * G.pu * dt;
        p.vy *= 1 - Math.min(0.9, p.drag * dt);
        p.r += p.gr * dt;
      } else if (p.type === 1) {
        p.vy += G.g * dt;
        const hf = clamp((G.ventTop - p.y) / G.maxH, 0, 1);
        p.vx += wpx * 0.5 * hf * dt;
        if (p.vy > 0 && p.y > ground + p.gy) {
          if (Math.random() < 0.05) steam(p.x, p.y, rand(-20, 20) * G.pu, -rand(5, 15) * G.pu, G.pu * 10, G.pu * 18, rand(2, 4), 0.18, 0.8, 3);
          continue;
        }
      } else {
        p.vy += G.pu * 30 * dt;
        p.vx *= 0.97;
        p.r += p.gr * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      P[j++] = p;
    }
    P.length = j;
  }

  function drawParticles(c) {
    for (const p of P) {
      const k = p.life / p.max;
      if (p.type === 0) {
        c.globalAlpha = p.a * Math.min(1, p.life / 0.4) * Math.pow(1 - k, 1.2);
        c.drawImage(p.grey ? puffG : puffW, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      } else if (p.type === 1) {
        c.globalAlpha = 0.9 - k * 0.3;
        c.drawImage(dropS, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      } else {
        c.globalAlpha = 0.45 * (1 - k);
        c.fillStyle = '#a58f6b';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  // ---------- eruption ----------
  const PLANS = {
    live: { pre: 30, ramp: 10, sustain: 95, decline: 45, steam: 50 },
    demo: { pre: 9, ramp: 6, sustain: 26, decline: 14, steam: 16 }
  };
  let idleAcc = 0, poolAcc = 0;

  function startEruption(kind) {
    if (state.eruption) return false;
    const plan = { ...PLANS[kind] };
    if (kind === 'live') plan.sustain = rand(70, 120);
    state.eruption = { kind, plan, t: 0, level: 0, phase: 'pre', nextSplash: 1, accW: 0, accS: 0, accB: 0, total: Object.values(plan).reduce((a, b) => a + b, 0) };
    state.onPhase && state.onPhase('pre', state.eruption);
    return true;
  }

  function splash(size) {
    const h = G.maxH * size;
    const v0 = Math.sqrt(2 * G.g * h);
    const n = Math.round(rand(14, 32) * qual + 6);
    for (let i = 0; i < n; i++) {
      const p = add(1, G.vx + rand(-1, 1) * G.coneW * 0.2, G.ventTop, rand(-1, 1) * G.pu * 18, -v0 * rand(0.5, 1.05), G.pu * rand(1.4, 2.6), 0, 4, 1, 0, 0);
      if (p) p.gy = rand(-H * 0.012, H * 0.012);
    }
    for (let i = 0; i < 6; i++) steam(G.vx + rand(-1, 1) * G.coneW * 0.3, G.ventTop, rand(-8, 8) * G.pu, -v0 * rand(0.2, 0.5), G.pu * rand(8, 14), G.pu * rand(14, 22), rand(3, 5), 0.24, 1.1, 4);
    OF.Sound.splash(0.12 + size);
  }

  function updateEruption(dt) {
    const e = state.eruption;
    if (!e) return;
    e.t += dt;
    const p = e.plan;
    let t = e.t, phase;
    if (t < p.pre) {
      phase = 'pre';
      e.level = 0;
      state.splashing = Math.min(1, state.splashing + dt);
      if (t >= e.nextSplash) {
        splash(rand(0.03, 0.08) + 0.12 * (t / p.pre));
        e.nextSplash = t + rand(0.7, 2.8);
      }
    } else if ((t -= p.pre) < p.ramp) {
      phase = 'ramp';
      e.level = easeOut(t / p.ramp) * 0.92;
    } else if ((t -= p.ramp) < p.sustain) {
      phase = 'sustain';
      e.level = 0.88 + 0.09 * Math.sin(e.t * 2.3) * Math.sin(e.t * 0.9) + 0.03 * Math.sin(e.t * 7);
    } else if ((t -= p.sustain) < p.decline) {
      phase = 'decline';
      const q = t / p.decline;
      e.level = lerp(0.85, 0.06, q) * (0.78 + 0.22 * Math.abs(Math.sin(e.t * 2.6)));
    } else if ((t -= p.decline) < p.steam) {
      phase = 'steam';
      e.level = 0;
      state.steamBoost = Math.max(state.steamBoost, 1 - (t / p.steam) * 0.4);
    } else {
      state.eruption = null;
      state.onPhase && state.onPhase('done', e);
      return;
    }
    if (phase !== 'pre') state.splashing = Math.max(0, state.splashing - dt);
    if (phase !== e.phase) {
      e.phase = phase;
      state.onPhase && state.onPhase(phase, e);
    }
    if (e.level > 0.01) emitColumn(dt, e);
  }

  function emitColumn(dt, e) {
    const L = e.level;
    const h = G.maxH * L;
    const v0 = Math.sqrt(2 * G.g * h);
    e.accW += dt * 210 * qual * L;
    while (e.accW >= 1) {
      e.accW--;
      const p = add(1, G.vx + rand(-1, 1) * G.coneW * 0.16, G.ventTop, rand(-1, 1) * h * 0.045, -v0 * rand(0.55, 1.02), G.pu * rand(1.6, 3.2), 0, 6, 1, 0, 0);
      if (p) p.gy = rand(-H * 0.012, H * 0.03);
    }
    e.accS += dt * 75 * qual * (0.3 + L);
    while (e.accS >= 1) {
      e.accS--;
      steam(G.vx + rand(-1, 1) * G.coneW * 0.25, G.ventTop - rand(0, h * 0.1), rand(-1, 1) * G.pu * 10, -v0 * rand(0.35, 0.95),
        G.pu * rand(10, 18), G.pu * rand(16, 30), rand(4, 8), rand(0.18, 0.3), 1.1, 3, Math.random() < 0.35);
    }
    e.accB += dt * 7 * qual;
    while (e.accB >= 1) {
      e.accB--;
      steam(G.vx + rand(-1, 1) * G.coneW, G.ventTop + G.coneH * 0.5, rand(-1, 1) * G.pu * 45, -G.pu * rand(5, 15),
        G.pu * rand(16, 24), G.pu * rand(18, 26), rand(4, 6), 0.22, 0.6, 2);
    }
  }

  function emitIdle(dt) {
    const e = state.eruption;
    const boost = state.steamBoost + (e && e.phase === 'pre' ? 0.6 : 0);
    idleAcc += dt * (8 + 22 * boost) * Math.max(0.5, qual);
    while (idleAcc >= 1) {
      idleAcc--;
      steam(G.vx + rand(-1, 1) * G.coneW * 0.2, G.ventTop, rand(-4, 4) * G.pu, -G.pu * rand(24, 44) * (1 + boost),
        G.pu * rand(6, 10), G.pu * rand(8, 15), rand(4.5, 8), 0.3, 0.25, 5);
    }
    poolAcc += dt * 1.6;
    while (poolAcc >= 1) {
      poolAcc--;
      const p = G.pools[(Math.random() * G.pools.length) | 0];
      steam(p.x + rand(-1, 1) * p.rx * 0.6, p.y, rand(-3, 3) * G.pu, -G.pu * rand(8, 16), G.pu * rand(4, 7), G.pu * rand(5, 9), rand(3, 5), 0.16, 0.3, 3);
    }
    if (!e) state.steamBoost = Math.max(0.2, state.steamBoost - dt * 0.012);
  }

  // ---------- people on the bench ----------
  function placePeople() {
    const R = rng(5);
    const spots = W < 700 ? [0.12, 0.3, 0.66, 0.86] : [0.17, 0.23, 0.3, 0.36, 0.61, 0.67, 0.74, 0.8, 0.87];
    people = spots.map((fx) => ({
      fx: fx + (R() - 0.5) * 0.015,
      sz: R() < 0.2 ? 0.72 : 0.9 + R() * 0.2,
      coat: pick(R, ['#2f4858', '#7a3b2e', '#3d5a40', '#b08a3e', '#4a4063', '#1f2a33', '#8a2f3c', '#35556b']),
      hair: pick(R, ['#2a1f1a', '#6b4a2f', '#b9a37a', '#111111', '#8d8d8d']),
      hat: pick(R, [null, null, 'beanie', 'cap', 'brim']),
      hatc: pick(R, ['#c9472f', '#2f5d7a', '#d8b24a', '#3b3b3b', '#6f8a4a']),
      ph: R() * TAU,
      filmer: R() < 0.55,
      lift: 0
    }));
  }

  function drawPeople(c, dt) {
    const by = G.benchY;
    const L = state.eruption ? Math.max(state.eruption.level, state.eruption.phase === 'pre' ? 0.2 : 0) : 0;
    for (const p of people) {
      p.lift += ((p.filmer && L > 0.15 ? 1 : 0) - p.lift) * Math.min(1, dt * 2.5);
      const s = u * p.sz;
      const x = p.fx * W + Math.sin(T * 0.4 + p.ph) * u * 1.2;
      c.fillStyle = p.coat;
      c.beginPath();
      c.moveTo(x - 22 * s, H + 2);
      c.lineTo(x - 20 * s, by - 20 * s);
      c.quadraticCurveTo(x - 18 * s, by - 34 * s, x - 6 * s, by - 36 * s);
      c.lineTo(x + 6 * s, by - 36 * s);
      c.quadraticCurveTo(x + 18 * s, by - 34 * s, x + 20 * s, by - 20 * s);
      c.lineTo(x + 22 * s, H + 2);
      c.fill();
      const hy = by - 45 * s;
      c.fillStyle = p.hair;
      c.beginPath(); c.arc(x, hy, 9 * s, 0, TAU); c.fill();
      if (p.hat === 'beanie') {
        c.fillStyle = p.hatc;
        c.beginPath(); c.arc(x, hy - 1 * s, 9.4 * s, Math.PI, 0); c.fill();
        c.beginPath(); c.arc(x, hy - 11 * s, 2.6 * s, 0, TAU); c.fill();
      } else if (p.hat === 'cap') {
        c.fillStyle = p.hatc;
        c.beginPath(); c.arc(x, hy - 1 * s, 9.4 * s, Math.PI, 0); c.fill();
      } else if (p.hat === 'brim') {
        c.fillStyle = p.hatc;
        c.beginPath(); c.ellipse(x, hy - 3 * s, 15 * s, 3 * s, 0, 0, TAU); c.fill();
        c.beginPath(); c.arc(x, hy - 4 * s, 7.5 * s, Math.PI, 0); c.fill();
      }
      if (p.lift > 0.02) {
        const ax = x + 14 * s, ay = by - 30 * s;
        const tx = x + 17 * s, ty = ay - 38 * s * p.lift;
        c.strokeStyle = p.coat;
        c.lineWidth = 6 * s;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(tx, ty); c.stroke();
        c.fillStyle = '#161616';
        c.fillRect(tx - 4 * s, ty - 13 * s, 8 * s, 13 * s);
        c.fillStyle = 'rgba(190,225,255,.9)';
        c.fillRect(tx - 3 * s, ty - 12 * s, 6 * s, 11 * s);
      }
    }
    // bench back rail, in front of the seated people
    c.fillStyle = '#4a3322';
    c.fillRect(0, by - 8 * u, W, 7 * u);
    c.fillStyle = '#5e4330';
    c.fillRect(0, by - 8 * u, W, 2 * u);
    c.fillStyle = '#3d2a1b';
    c.fillRect(0, by + 10 * u, W, 6 * u);
  }

  // ---------- bison ----------
  const bisons = [];
  function placeAnimals() {
    placePeople();
    if (!bisons.length) {
      const spec = [
        { fx: 0.8, fy: 0.705, min: 0.68, max: 0.97 },
        { fx: 0.9, fy: 0.748, min: 0.7, max: 0.97 },
        { fx: 0.17, fy: 0.738, min: 0.03, max: 0.32 }
      ];
      for (const s of spec) bisons.push({ ...s, dir: Math.random() < 0.5 ? 1 : -1, state: 'graze', timer: rand(2, 10), leg: 0, head: 1, headT: 1, tail: 0, pawT: 0, calf: false, target: s.fx });
      const mom = bisons[1];
      bisons.push({ fx: mom.fx - 0.03, fy: mom.fy + 0.012, min: 0.66, max: 0.99, dir: mom.dir, state: 'graze', timer: 3, leg: 0, head: 1, headT: 1, tail: 0, pawT: 0, calf: true, mom });
    }
    if (!ravens.length) {
      for (let i = 0; i < 3; i++) ravens.push(newRaven(i === 0 ? 0.5 : rand(3, 14)));
    }
    hawk.cx = W * 0.3; hawk.cy = H * 0.17;
  }

  function bisonXY(b) {
    const y = gy(b.fy);
    return { x: b.fx * W, y, s: u * 0.62 * depth(y) * (b.calf ? 0.58 : 1) };
  }

  function updateBison(b, dt) {
    b.tail += dt * (2 + Math.sin(T * 0.7 + b.fy * 10) * 1.5);
    b.head += (b.headT - b.head) * Math.min(1, dt * 2);
    if (b.calf) {
      const m = b.mom;
      const want = m.fx - m.dir * 0.035;
      const d = want - b.fx;
      b.dir = Math.abs(d) > 0.004 ? Math.sign(d) : m.dir;
      if (Math.abs(d) > 0.004) {
        b.fx += Math.sign(d) * Math.min(Math.abs(d), (u * 12 * dt) / W);
        b.leg += dt * 7;
        b.state = 'walk';
        b.headT = 0.4;
      } else {
        b.state = 'graze';
        b.headT = 0.8;
      }
      return;
    }
    b.timer -= dt;
    if (b.state === 'walk') {
      const d = b.target - b.fx;
      const step = (u * 9 * dt) / W;
      if (Math.abs(d) <= step) { b.fx = b.target; b.state = 'graze'; b.timer = rand(6, 14); b.headT = 1; }
      else { b.fx += Math.sign(d) * step; b.leg += dt * 5; }
    } else if (b.state === 'paw') {
      b.pawT += dt;
      b.headT = 0.75;
      if (Math.sin(b.pawT * 9) > 0.9 && Math.random() < 0.5) {
        const { x, y, s } = bisonXY(b);
        dust(x + b.dir * 26 * s, y);
      }
      if (b.timer < 0) { b.state = 'graze'; b.timer = rand(8, 14); b.headT = 1; }
    } else if (b.timer < 0) {
      if (b.state === 'graze' && Math.random() < 0.6) {
        b.target = clamp(b.fx + rand(-0.12, 0.12), b.min, b.max);
        b.dir = b.target > b.fx ? 1 : -1;
        b.state = 'walk';
        b.headT = 0.45;
      } else if (b.state === 'graze') {
        b.state = 'look'; b.headT = 0.2; b.timer = rand(3, 6);
      } else {
        b.state = 'graze'; b.headT = 1; b.timer = rand(6, 14);
      }
    }
    if (b.state === 'graze') b.headT = 0.9 + 0.1 * Math.sin(T * 1.7 + b.fy * 30);
  }

  function drawBison(c, b) {
    const { x, y, s } = bisonXY(b);
    c.save();
    c.translate(x, y);
    c.scale(b.dir * s, s);
    // shadow
    c.fillStyle = 'rgba(40,30,20,.18)';
    c.beginPath(); c.ellipse(0, 0, 50, 5, 0, 0, TAU); c.fill();

    const walk = b.state === 'walk';
    const sw = (o) => (walk ? Math.sin(b.leg + o) * 0.42 : 0);
    const paw = b.state === 'paw' ? Math.max(0, Math.sin(b.pawT * 9)) : 0;
    const hind = b.calf ? '#6a4a2e' : '#3d2a1c', cape = b.calf ? '#7d5a38' : '#5d4028', far = b.calf ? '#553a24' : '#281b12', dark = b.calf ? '#4c3420' : '#2b1e15';

    const leg = (lx, ang, col, lift = 0) => {
      c.save();
      c.translate(lx, -18);
      c.rotate(ang);
      c.fillStyle = col;
      c.beginPath(); c.moveTo(-3.4, 0); c.lineTo(3.4, 0); c.lineTo(2.3, 18 - lift); c.lineTo(-2.3, 18 - lift); c.closePath(); c.fill();
      c.fillStyle = '#17100a';
      c.fillRect(-2.7, 16.5 - lift, 5.4, 2.5);
      c.restore();
    };
    leg(-30, sw(0), far);
    leg(18, sw(Math.PI), far);

    c.strokeStyle = dark; c.lineWidth = 2; c.lineCap = 'round';
    const tw = Math.sin(b.tail) * 3;
    c.beginPath(); c.moveTo(-44, -36); c.quadraticCurveTo(-49 + tw, -30, -47 + tw * 1.3, -20); c.stroke();
    c.fillStyle = dark;
    c.beginPath(); c.ellipse(-47 + tw * 1.3, -19, 2, 3.5, 0, 0, TAU); c.fill();

    c.fillStyle = hind;
    c.beginPath(); c.ellipse(-24, -31, 22, 16, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(-40, -28); c.quadraticCurveTo(-10, -12, 24, -18); c.lineTo(24, -42); c.lineTo(-30, -45); c.fill();

    leg(-22, sw(Math.PI), hind);
    leg(26, sw(0) - paw * 0.7, cape, paw * 5);

    c.fillStyle = cape;
    c.beginPath();
    c.moveTo(-10, -44);
    c.bezierCurveTo(-4, -62, 26, -68, 40, -50);
    c.bezierCurveTo(48, -40, 46, -24, 36, -14);
    c.bezierCurveTo(24, -10, 10, -12, 2, -18);
    c.bezierCurveTo(-6, -26, -12, -36, -10, -44);
    c.fill();
    c.strokeStyle = b.calf ? '#8c6844' : '#6e4d30';
    c.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const a = -0.2 + i * 0.25;
      c.beginPath(); c.moveTo(4 + i * 6, -58 + Math.abs(a) * 8); c.lineTo(2 + i * 6, -52 + Math.abs(a) * 8); c.stroke();
    }

    c.save();
    c.translate(40, -30);
    c.rotate(b.head * 0.9 - 0.1);
    c.fillStyle = dark;
    c.beginPath(); c.ellipse(10, 10, 10, 12, -0.3, 0, TAU); c.fill();
    if (!b.calf) {
      c.beginPath(); c.moveTo(4, 16); c.quadraticCurveTo(6, 28, 11, 26); c.quadraticCurveTo(14, 22, 14, 16); c.fill();
    }
    c.fillStyle = cape;
    c.beginPath(); c.ellipse(5, 2, 9, 8, 0, 0, TAU); c.fill();
    if (!b.calf) {
      c.strokeStyle = '#d8d0bd'; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(8, -1); c.quadraticCurveTo(14, -5, 13, -11); c.stroke();
    }
    c.fillStyle = '#0c0806';
    c.beginPath(); c.arc(14, 8, 1.2, 0, TAU); c.fill();
    c.restore();
    c.restore();
  }

  // ---------- ravens ----------
  const ravens = [];
  function newRaven(delay) {
    return { x: -100, y: 0, vx: 0, vy: 0, dir: 1, state: 'off', timer: delay, flap: Math.random() * TAU, flapping: true, flapT: 0, s: 1, banner: null, land: null, peck: 0, hopT: 0, ph: Math.random() * TAU, t: 0, baseY: 0, croakT: rand(4, 12) };
  }
  function launchRaven(r, opts = {}) {
    r.dir = opts.dir || (Math.random() < 0.5 ? 1 : -1);
    r.x = r.dir > 0 ? -60 : W + 60;
    r.y = r.baseY = opts.y != null ? opts.y : H * rand(0.12, 0.38);
    r.vx = r.dir * (opts.speed || u * rand(60, 90));
    r.vy = 0;
    r.state = 'fly';
    r.t = 0;
    r.s = u * rand(0.8, 1);
    r.banner = opts.banner || null;
    r.land = !opts.banner && Math.random() < 0.45 ? { x: W * (Math.random() < 0.5 ? rand(0.3, 0.4) : rand(0.58, 0.7)), y: gy(rand(0.72, 0.84)) } : null;
    if (r.land && (Math.abs(r.land.x - G.vx) < W * 0.08 || G.pools.some((p) => Math.abs(r.land.x - p.x) < p.rx * 1.6 && Math.abs(r.land.y - p.y) < p.ry * 3))) r.land = null;
  }

  function updateRaven(r, dt) {
    if (r.state === 'off') {
      r.timer -= dt;
      if (r.timer <= 0) launchRaven(r);
      return;
    }
    r.t += dt;
    const flapRate = r.banner ? 3.2 : 2.6;
    if (r.state === 'fly' || r.state === 'descend' || r.state === 'climb') {
      if (!r.banner && r.state === 'fly') {
        r.flapT -= dt;
        if (r.flapT < 0) { r.flapping = !r.flapping; r.flapT = r.flapping ? rand(1, 2) : rand(0.8, 2); }
      } else r.flapping = true;
      if (r.flapping || RM) r.flap += dt * TAU * (RM ? flapRate * 0.5 : flapRate);
      else r.flap += (Math.PI * 0.08 - (((r.flap % TAU) + TAU) % TAU)) * Math.min(1, dt * 4);
      r.croakT -= dt;
      if (r.croakT < 0 && r.x > 0 && r.x < W) { OF.Sound.croak((r.x / W) * 2 - 1); r.croakT = rand(8, 20); }
    }
    if (r.state === 'fly') {
      r.x += r.vx * dt;
      r.y = r.baseY + Math.sin(r.t * 0.7 + r.ph) * u * 14;
      if (r.land && Math.abs(r.land.x - r.x) < W * 0.28 && Math.sign(r.land.x - r.x) === r.dir) {
        r.state = 'descend';
        r.startS = r.s;
        r.startD = Math.hypot(r.land.x - r.x, r.land.y - r.y);
      }
      if (r.x < -120 || r.x > W + 120) { r.state = 'off'; r.timer = rand(4, 14); r.banner = null; }
    } else if (r.state === 'descend') {
      const dx = r.land.x - r.x, dy = r.land.y - r.y;
      const d = Math.hypot(dx, dy);
      const sp = Math.max(u * 30, Math.min(u * 90, d * 1.2));
      if (d < 3) {
        r.x = r.land.x; r.y = r.land.y;
        r.state = 'ground';
        r.timer = rand(5, 11);
        r.hopT = rand(1, 3);
      } else {
        r.x += (dx / d) * sp * dt;
        r.y += (dy / d) * sp * dt;
        if (Math.abs(dx) > 1) r.dir = Math.sign(dx);
      }
      r.s = lerp(u * 0.9 * depth(r.land.y), r.startS, clamp(d / r.startD, 0, 1));
    } else if (r.state === 'ground') {
      r.timer -= dt;
      r.peck = Math.max(0, Math.sin(r.t * 5)) * (Math.sin(r.t * 0.9) > 0.3 ? 1 : 0);
      r.hopT -= dt;
      if (r.hopT < 0) {
        r.hopT = rand(1.5, 4);
        if (Math.random() < 0.3) r.dir *= -1;
        r.x += r.dir * u * rand(4, 10);
      }
      if (r.timer < 0) {
        r.state = 'climb';
        r.vx = r.dir * u * 75;
        r.vy = -u * 70;
        r.targetY = H * rand(0.15, 0.35);
      }
    } else if (r.state === 'climb') {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.s = Math.max(u * 0.8, r.s - dt * u * 0.1);
      if (r.y <= r.targetY) { r.state = 'fly'; r.baseY = r.y; r.t = 0; r.land = null; }
      if (r.x < -120 || r.x > W + 120) { r.state = 'off'; r.timer = rand(4, 14); }
    }
  }

  function drawRaven(c, r) {
    c.save();
    c.translate(r.x, r.y);
    c.scale(r.dir * r.s, r.s);
    c.fillStyle = '#15171c';
    if (r.state === 'ground') {
      c.strokeStyle = '#15171c'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-1, -4); c.lineTo(-2, 0); c.moveTo(2, -4); c.lineTo(3, 0); c.stroke();
      c.save();
      c.translate(0, -9);
      c.rotate(r.peck * 0.45);
      c.beginPath(); c.ellipse(0, 0, 10, 5.5, -0.15, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(-8, -1); c.lineTo(-18, 2); c.lineTo(-17, 5); c.lineTo(-7, 3); c.fill();
      c.beginPath(); c.arc(9, -4, 4, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(12, -5); c.lineTo(18, -3); c.lineTo(12, -2); c.fill();
      c.restore();
    } else {
      const f = Math.sin(r.flap);
      c.fillStyle = '#252830';
      c.beginPath();
      c.moveTo(7, -1); c.quadraticCurveTo(4, -10 * f, -1, -17 * f); c.lineTo(-5, -15 * f); c.quadraticCurveTo(-3, -6 * f, -2, 0);
      c.fill();
      c.fillStyle = '#15171c';
      c.beginPath(); c.ellipse(0, 0, 13, 4.5, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(12, -1, 3.8, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(15, -2); c.lineTo(21, 0); c.lineTo(15, 1); c.fill();
      c.beginPath(); c.moveTo(-11, -2); c.lineTo(-21, -4); c.lineTo(-22, 0); c.lineTo(-21, 4); c.lineTo(-11, 2); c.fill();
      c.beginPath();
      c.moveTo(5, -1); c.quadraticCurveTo(1, -13 * f, -5, -23 * f); c.lineTo(-9, -21 * f); c.quadraticCurveTo(-7, -8 * f, -5, 0);
      c.fill();
    }
    c.restore();
  }

  // ---------- hawk ----------
  const hawk = { cx: 0, cy: 0, ang: Math.random() * TAU, R: 1, on: true, t: 0 };
  function updateHawk(dt) {
    hawk.t += dt;
    hawk.ang += dt * 0.22;
    hawk.cx = W * (0.3 + 0.12 * Math.sin(hawk.t * 0.013));
    hawk.cy = H * 0.16;
  }
  function drawHawk(c) {
    const R = u * 110;
    const x = hawk.cx + Math.cos(hawk.ang) * R;
    const y = hawk.cy + Math.sin(hawk.ang) * R * 0.3;
    c.save();
    c.translate(x, y);
    c.rotate(Math.sin(hawk.ang) * 0.15);
    c.scale(u * 0.62 * (0.7 + 0.3 * Math.abs(Math.sin(hawk.ang))), u * 0.62);
    c.fillStyle = '#3b2f26';
    c.beginPath();
    c.moveTo(0, -1);
    c.quadraticCurveTo(-8, -6, -18, -4); c.quadraticCurveTo(-25, -3, -31, 0);
    c.lineTo(-28, 1.5); c.quadraticCurveTo(-18, 0.5, -8, 2.5); c.lineTo(-2.5, 3);
    c.lineTo(-2, 8); c.lineTo(2, 8); c.lineTo(2.5, 3);
    c.lineTo(8, 2.5); c.quadraticCurveTo(18, 0.5, 28, 1.5); c.lineTo(31, 0);
    c.quadraticCurveTo(25, -3, 18, -4); c.quadraticCurveTo(8, -6, 0, -1);
    c.fill();
    c.beginPath(); c.arc(0, -1.5, 2.4, 0, TAU); c.fill();
    c.restore();
  }

  // ---------- frame ----------
  function update(dt) {
    T += dt;
    gustT -= dt;
    if (gustT < 0) { gust = rand(0.2, 0.5); gustT = rand(10, 30); }
    gust = Math.max(0, gust - dt * 0.06);
    wind = clamp(0.45 + 0.28 * Math.sin(T * 0.07) + 0.15 * Math.sin(T * 0.23 + 1) + gust, 0.08, 1.2);

    updateEruption(dt);
    emitIdle(dt);
    updateParticles(dt);
    for (const b of bisons) updateBison(b, dt);
    for (const r of ravens) updateRaven(r, dt);
    updateHawk(dt);
    for (const cl of clouds) {
      cl.x += wind * cl.sp * u * 6 * dt;
      if (cl.x - 140 * cl.s > W) cl.x = -140 * cl.s;
    }
  }

  function currentHour() { return skyHourOverride != null ? skyHourOverride : parkHour(); }

  function render(dt) {
    const k = skyAt(currentHour());
    ctx.clearRect(0, 0, W, H);
    drawSky(ctx, k);

    const c = wx;
    c.clearRect(0, 0, W, H);
    c.drawImage(backL, 0, 0, W, H);
    drawHawk(c);
    const swayAmp = RM ? 0.3 : 1;
    for (const t of midTrees) drawPine(c, t, swayAmp * t.flex * (wind * 0.02 + Math.sin(T * 1.6 + t.ph) * 0.008 * (0.5 + wind)));
    c.drawImage(frontL, 0, 0, W, H);

    const grounded = [];
    for (const b of bisons) grounded.push({ y: gy(b.fy), d: () => drawBison(c, b) });
    for (const r of ravens) if (r.state === 'ground') grounded.push({ y: r.y, d: () => drawRaven(c, r) });
    grounded.sort((a, b) => a.y - b.y);
    let gi = 0;
    while (gi < grounded.length && grounded[gi].y < G.vy + H * 0.01) grounded[gi++].d();
    drawParticles(c);
    while (gi < grounded.length) grounded[gi++].d();

    for (const r of ravens) {
      if (r.state === 'off' || r.state === 'ground') continue;
      if (r.banner && r.banner.anchor) {
        c.strokeStyle = 'rgba(40,30,20,.8)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(r.x - r.dir * 4 * r.s, r.y + 3 * r.s);
        c.quadraticCurveTo((r.x + r.banner.anchor.x) / 2, r.y + 14 * r.s, r.banner.anchor.x, r.banner.anchor.y);
        c.stroke();
      }
      drawRaven(c, r);
    }

    for (const t of nearTrees) drawPine(c, t, swayAmp * (wind * 0.012 + Math.sin(T * 1.1 + t.ph) * 0.005 * (0.5 + wind)));
    c.drawImage(fgL, 0, 0, W, H);
    drawPeople(c, dt);

    if (k.ta > 0.005) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = css(k.tint, k.ta);
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(wc, 0, 0, W, H);
  }

  return {
    state, bisons, ravens, G,
    get W() { return W; }, get H() { return H; }, get u() { return u; }, get wind() { return wind; },
    resize, update, render, startEruption, launchRaven, bisonXY, steam, dust, depth,
    setSkyHour(h) { skyHourOverride = h; },
    parkHour: currentHour,
    reducedMotion: RM
  };
})();
