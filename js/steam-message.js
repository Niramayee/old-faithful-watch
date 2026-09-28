/* Trivia carried by steam: a faint cloud rises out of the vent, swells, lets go and holds the text
   for a while, then tears apart and evaporates. Art: assets/wisps/ (two Recraft wisps).
   One small canvas for the cloud plus one text element, both moved with transforms. */
window.OF = window.OF || {};

OF.SteamMessage = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const win = (v, a, b) => smooth((v - a) / (b - a));
  const easeOut = (v) => 1 - Math.pow(1 - clamp(v, 0, 1), 3);
  const lerp = (a, b, t) => a + (b - a) * t;

  // Everything is laid out in the cloud's own 1024-unit space ("C space", from 3-cloud.svg).
  // Each sprite says where it sits in that space so cross-fades line up.
  const CB = { x: 290, y: 1000 };                // bottom of the cloud's column: sits on the vent while it grows
  const CC = { x: 560, y: 440 };                 // middle of the cloud
  const TEXT = { x: 190, y: 385, w: 760, h: 240 }; // where the words go
  const SPRITES = {
    // cloud: warm the slate shadows a touch
    cloud: { src: '3-cloud',     dx: 0,          dy: 0,          fade: [700, 990], tint: 'rgba(246,226,200,.18)' },
    // streak: lighten the taupe core toward cream
    evap:  { src: '4-evaporate', dx: CC.x - 520, dy: CC.y - 510, tint: 'rgba(250,240,222,.45)' }
  };
  const RES = 1.25;       // sprite resolution: px per unit at load
  const EDGE = 18;        // width of the traced frame around each square, removed at load

  // Timeline of one message, in seconds (the hang time depends on the text length).
  const T = { grow: 4.8, textIn: 1.3, evap: 4.6 };

  // ---------- load: rasterize each wisp, strip the traced frame and stray fragments ----------
  const sprites = {};
  const loadImg = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });

  // Keep only the wisp itself: connected pieces at least 4% the size of the biggest one.
  function pruneFragments(x, N) {
    const id = x.getImageData(0, 0, N, N), d = id.data;
    const lab = new Int32Array(N * N), sizes = [0], stack = new Int32Array(N * N);
    for (let p = 0; p < N * N; p++) {
      if (lab[p] || d[p * 4 + 3] < 8) continue;
      const L = sizes.length; let n = 0, top = 0;
      stack[top++] = p; lab[p] = L;
      while (top) {
        const q = stack[--top]; n++;
        const qx = q % N;
        const nb = [qx > 0 ? q - 1 : -1, qx < N - 1 ? q + 1 : -1, q - N, q + N];
        for (const r of nb) if (r >= 0 && r < N * N && !lab[r] && d[r * 4 + 3] >= 8) { lab[r] = L; stack[top++] = r; }
      }
      sizes.push(n);
    }
    const big = Math.max(...sizes);
    for (let p = 0; p < N * N; p++) if (lab[p] && sizes[lab[p]] < big * 0.04) d[p * 4 + 3] = 0;
    x.putImageData(id, 0, 0);
  }

  function clean(img, { fade, erase, tint }) {
    const N = Math.round(1024 * RES);
    const c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, N, N);
    const e = Math.round(EDGE * RES);
    x.clearRect(0, 0, N, e); x.clearRect(0, N - e, N, e); x.clearRect(0, 0, e, N); x.clearRect(N - e, 0, e, N);
    // Browsers refuse pixel access when the page is opened as a file (file://); then the wisp keeps its fragments.
    try { pruneFragments(x, N); } catch { /* opened as a file */ }
    // fade the bottom so the column lets go of the ground once the cloud floats
    if (erase) {   // soft-edged round eraser, so nothing gets a straight cut
      const [ex, ey, er] = erase.map((v) => v * RES);
      const rg = x.createRadialGradient(ex, ey, 0, ex, ey, er);
      rg.addColorStop(0, '#000'); rg.addColorStop(0.7, '#000'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalCompositeOperation = 'destination-out';
      x.fillStyle = rg; x.fillRect(ex - er, ey - er, er * 2, er * 2);
      x.globalCompositeOperation = 'source-over';
    }
    if (tint) {
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = tint; x.fillRect(0, 0, N, N);
      x.globalCompositeOperation = 'source-over';
    }
    if (fade) {
      x.globalCompositeOperation = 'destination-in';
      const g = x.createLinearGradient(0, fade[0] * RES, 0, fade[1] * RES);
      g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, N, N);
    }
    return c;
  }

  // The clouds take the steam colours of the time-of-day look (js/palette.js); dusk is as painted.
  let ready = null, look = 'dusk';
  const texts = {};
  async function wispImg(src, lk) {
    if (lk === 'dusk' || !window.OF.Palette) return loadImg(`assets/wisps/${src}.svg`);
    if (!texts[src]) texts[src] = fetch(`assets/wisps/${src}.svg`).then((r) => r.text());
    const url = URL.createObjectURL(new Blob([OF.Palette.recolor(await texts[src], lk, { family: 'steam' })], { type: 'image/svg+xml' }));
    try { return await loadImg(url); } finally { URL.revokeObjectURL(url); }
  }
  function build(lk) {
    return Promise.all(Object.entries(SPRITES).map(async ([k, s]) => [k, clean(await wispImg(s.src, lk), s)]))
      .then((pairs) => { if (lk === look) for (const [k, c] of pairs) sprites[k] = c; });
  }
  function load(lk) {
    if (lk) look = lk;
    if (!ready) ready = build(look);
    return ready;
  }
  function setLook(lk) {
    if (lk === look) return ready;
    look = lk;
    ready = (ready || Promise.resolve()).then(() => (lk === look ? build(lk) : null));
    return ready;
  }

  // ---------- one message ----------
  // opts.layer: element to put it in (full-window, position:fixed or absolute)
  // opts.vent(): {x, y} of the vent in that element's px
  // opts.safe(): {top, bottom} px the cloud must stay clear of (title, controls)
  function create(fact, opts) {
    const box = document.createElement('div');
    box.className = 'steam-msg';
    box.setAttribute('role', 'note');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const text = document.createElement('div');
    text.className = 'steam-msg-text';
    const cat = document.createElement('span');
    cat.className = 'steam-msg-cat';
    cat.textContent = fact.c;
    const p = document.createElement('p');
    p.textContent = fact.t;
    text.append(cat, p);
    box.append(canvas, text);
    opts.layer.append(box);
    const ctx = canvas.getContext('2d');

    const words = fact.t.split(/\s+/).length;
    const hang = clamp(5 + words * 0.32, 8, 14);
    const total = T.grow + T.textIn + hang + T.evap;
    const drift = 4 + Math.random() * 5;   // px/s downwind, the same way the plume blows
    const ph = Math.random() * 6.28;
    let kf = 0.5, W = 0, H = 0, dpr = 1, root = { x: 0, y: 0 };

    // Size the cloud to the window and the text, then pick where it hangs.
    function layout() {
      W = opts.layer.clientWidth; H = opts.layer.clientHeight;
      const narrow = W < 720;
      text.style.fontSize = narrow ? '14.5px' : '17px';
      // on narrow screens the cloud may spill a little past the edges; the words never do
      const kMax = (narrow ? W + 150 : W - 24) / 970;
      kf = Math.min(460 / 970, kMax);
      // grow the cloud if the words need more room than its middle offers
      for (let i = 0; i < 6; i++) {
        text.style.width = `${Math.min(TEXT.w * kf * (narrow ? 0.68 : 1), W - 56)}px`;
        const need = text.offsetHeight / (TEXT.h * 0.9);
        if (need <= kf || kf >= kMax) break;
        kf = Math.min(need, kMax);
      }
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      // canvas covers C space [-200, 0] .. [1300, 1100] at full size, plus room to swell
      const cw = Math.round(1500 * kf * dpr), ch = Math.round(1100 * kf * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      canvas.style.width = `${1500 * kf}px`; canvas.style.height = `${1100 * kf}px`;
      const safe = opts.safe ? opts.safe() : { top: 16, bottom: 16 };
      const v = vent();
      // The column's foot sits on the vent and the cloud forms downwind (to the right) of it.
      // Only if that would leave the screen does the foot drift off the vent as it grows.
      const bleed = narrow ? -75 : 12, travel = drift * (hang + T.textIn) + 70;
      root = {
        x: clamp(v.x, bleed + (CB.x - 30) * kf, W - bleed - (1000 - CB.x) * kf - travel),
        y: Math.max(v.y, safe.top + (CB.y - 240) * kf)
      };
    }
    layout();

    function vent() { const v = opts.vent(); return { x: v.x, y: v.y - 12 }; }   // just inside the rim
    const api = { t: 0, done: false, total, layout: () => { layout(); api.update(0); }, remove: () => box.remove(), el: box };

    api.update = (dt) => {
      if (api.done) return;
      api.t += dt;
      const t = api.t;
      if (t >= total) { api.done = true; box.remove(); return; }
      const v = vent();
      const tHang = T.grow + T.textIn, tEvap = tHang + hang;

      // scale and position of C space on screen
      // stays a small wisp while it rises, and only swells into the cloud just before the words appear
      let k = kf * (0.16 + 0.84 * smooth(t / T.grow));
      const e = win(t, tEvap, tEvap + T.evap);
      k *= 1 + 0.012 * Math.sin(t * 0.6 + ph) + 0.12 * e;
      const floatT = Math.max(0, t - T.grow);
      const release = win(t, 2.6, T.grow + 0.6);   // the foot leaves the vent only once the cloud is forming
      const R = {   // the column's foot
        x: lerp(v.x, root.x, release) + drift * floatT + 70 * e * e,
        y: lerp(v.y, root.y, release) - 2.5 * floatT + 4 * Math.sin(t * 0.8 + ph) - 40 * e * e
      };
      const P = { x: R.x + (CC.x - CB.x) * k, y: R.y + (CC.y - CB.y) * k };   // cloud middle on screen

      // Kept faint so it never outshines the real plume, a little firmer only while it holds the words.
      const holding = win(t, T.grow - 0.4, tHang) * (1 - win(t, tEvap, tEvap + 1.2));
      const a = {
        cloud: win(t, 0, 1.2) * (1 - win(t, tEvap + 0.8, tEvap + 1.7)) * lerp(0.22, 0.45, holding),
        evap: win(t, tEvap + 0.4, tEvap + 1.0) * (1 - win(t, tEvap + 1.6, tEvap + T.evap)) * 0.24
      };

      // draw: canvas is pinned so C point (-200, 0) at full size sits at its top-left
      const ox = (CC.x + 200) * kf, oy = CC.y * kf;
      box.style.transform = `translate3d(${(P.x - ox).toFixed(1)}px, ${(P.y - oy).toFixed(1)}px, 0)`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(ox, oy); ctx.scale(k, k); ctx.translate(-CC.x, -CC.y);
      for (const key of ['cloud', 'evap']) {
        if (a[key] < 0.004) continue;
        const s = SPRITES[key];
        ctx.save();
        ctx.globalAlpha = a[key];
        if (key === 'evap') {
          // tearing apart: flattened into a wind-streak, stretching downwind
          const st = win(t, tEvap, tEvap + T.evap);
          ctx.translate(CC.x, CC.y); ctx.scale(1 + 0.4 * st, 0.5 - 0.08 * st); ctx.translate(-CC.x, -CC.y);
        }
        ctx.drawImage(sprites[key], s.dx, s.dy, 1024, 1024);
        ctx.restore();
      }
      // once formed, the cloud lets go of the vent: its column evaporates from the bottom up
      const yd = lerp(1000, 620, win(t, T.grow - 0.6, T.grow + 3));
      if (yd < 999) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        const dg = ctx.createLinearGradient(0, yd, 0, yd + 150);
        dg.addColorStop(0, '#000'); dg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = dg;
        ctx.fillRect(-400, -200, 2000, 1500);
        ctx.restore();
      }
      // a soft cream wash behind the words, only where there is cloud, so the text reads
      const wash = Math.min(1, a.cloud * 2) * win(t, tHang - 0.8, tHang) * 0.8;
      if (wash > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = wash;
        const tx = TEXT.x + TEXT.w / 2, ty = TEXT.y + TEXT.h / 2;
        ctx.translate(tx, ty); ctx.scale(1, TEXT.h / TEXT.w);
        const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, TEXT.w * 0.62);
        const wc = look === 'night' ? '38,46,70' : '252,246,234';   // at night the words are light, so the wash is dark
        rg.addColorStop(0, `rgb(${wc})`); rg.addColorStop(0.7, `rgba(${wc},.85)`); rg.addColorStop(1, `rgba(${wc},0)`);
        ctx.fillStyle = rg;
        ctx.fillRect(-TEXT.w, -TEXT.w, TEXT.w * 2, TEXT.w * 2);
        ctx.restore();
      }

      // the words: appear once the cloud has formed, grow a little, then evaporate first
      const tin = win(t, T.grow - 0.4, tHang);
      const tout = win(t, tEvap, tEvap + 1.5);
      const ts = (0.8 + 0.2 * easeOut((t - (T.grow - 0.4)) / (T.textIn + 1.5))) * (1 + 0.06 * tout) * (k / kf);
      text.style.opacity = (tin * (1 - tout)).toFixed(3);
      // the words stay centred on the cloud's text area as it scales
      const boxX = P.x - ox, half = text.offsetWidth / 2;
      const tcx = clamp(ox + (TEXT.x + TEXT.w / 2 - CC.x) * k, 16 + half - boxX, W - 16 - half - boxX), tcy = oy + (TEXT.y + TEXT.h / 2 - CC.y) * k - 10 * tout;
      text.style.transform = `translate(${(tcx - text.offsetWidth / 2).toFixed(1)}px, ${(tcy - text.offsetHeight / 2).toFixed(1)}px) scale(${ts.toFixed(4)})`;
      text.style.filter = tout > 0.01 ? `blur(${(tout * 3).toFixed(2)}px)` : '';
    };

    // skip ahead to evaporating (e.g. when an eruption starts)
    api.evaporate = () => { const tEvap = T.grow + T.textIn + hang; if (api.t < tEvap) api.t = tEvap; };
    // jump to a moment (for testing)
    api.seek = (s) => { api.t = Math.max(0, s - 1 / 60); api.update(1 / 60); };
    return api;
  }

  return { load, setLook, create, T };
})();
