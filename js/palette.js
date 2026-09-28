/* Time-of-day looks for the poster art. The Recraft SVGs are flat shapes with ~40–50 colours each,
   so instead of filtering pixels we give each shape a new ink: every fill is sorted into a family
   (sky, mountains, forest, cone, ground, steam) by its colour and where it sits, then re-graded
   for the chosen time of day. Dusk is the art as painted. */
window.OF = window.OF || {};

OF.Palette = (() => {
  const HORIZON = 470;   // art y where the mountains meet the sky

  // ---------- colour helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToHex([h, s, l]) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
  }
  const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgbToHex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => rgbToHex(hexToRgb(a).map((v, i) => v + (hexToRgb(b)[i] - v) * t));
  const hueMix = (h, target, t) => {
    const d = ((target - h + 540) % 360) - 180;
    return Math.abs(d) > 90 ? target : h + d * t;   // far hues go straight there: no magenta detours
  };

  // ---------- which family a shape belongs to ----------
  // Where things are in the 2384×1024 art. PLUMES: the area each frame's steam and water occupy.
  const PLUMES = {
    '00-idle': [1150, 480, 1320, 745],
    '02-rising': [1000, 360, 1460, 745], '03-tall-jet': [1040, 20, 1420, 745], '04-full': [940, 10, 1560, 745],
    '05-declining': [1000, 120, 2150, 745], '06-collapse-steam': [1060, 240, 2120, 745], '07-steam-fading': [940, 180, 2040, 745]
  };
  const CONE = [980, 690, 1480, 752];    // the grey mound itself (not the ground around it)
  const MOUND = [980, 690, 1480, 785];   // the mound plus its pale fringe
  const GROUND_LINE = 750;               // below this: the basin floor
  const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

  // hex: the fill (or a gradient's average); box: [x0, y0, x1, y1] of the shape
  function family(hex, box, plume) {
    const [h, s, l] = hexToHsl(hex);
    const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, wide = x1 - x0 > 300;
    // steam: anything light inside the plume (whatever its tint: sunlit peach, shaded blue)
    const idle = plume === PLUMES['00-idle'];
    // (the quiet frame's small puff fakes see-through steam with pieces painted in mountain and forest
    //  colours, so there only the genuinely pale jet counts; eruption plumes take their shadows too)
    if (plume && !wide && inBox(plume, cx, cy) && (idle ? (l >= 0.72 || (l >= 0.6 && s < 0.3)) : (l >= 0.55 || (s < 0.2 && l >= 0.38 && !(h >= 235 && h <= 290))))) return 'steam';
    // sky: the big saturated-orange bands above the horizon (and stray specks of sky colour)
    if (cy < HORIZON - 40 && h >= 20 && h <= 45 && s >= 0.6 && l <= 0.8) return 'sky';
    if (h >= 24 && h <= 40 && s >= 0.75 && l <= 0.78 && y0 < HORIZON - 20 && (wide || y1 - y0 > 300)) return 'sky';
    if (inBox(CONE, cx, cy) && s < 0.25 && !(h > 180 && h < 235)) return 'cone';
    // pale pools and shallow water on the basin floor
    if (cy > GROUND_LINE - 60 && l >= 0.66 && s < 0.4 && !inBox(MOUND, cx, cy) && (h > 150 || l >= 0.8)) return 'blue';
    if (h > 180 && h < 235) return 'blue';
    if (h >= 235 && h <= 290 && s < 0.12) return 'cone';
    // the forest band between the mountains and the basin floor: dark or rust-lit trees
    if (cy > HORIZON + 60 && cy < GROUND_LINE && l < 0.5) return 'forest';
    if (l < 0.3 && h >= 38 && h <= 66) return 'forest';
    // loose pale steam above the ground (wisps drifting off the plume)
    if (cy < GROUND_LINE - 40 && (l >= 0.86 || (l >= 0.74 && s < 0.45))) return 'steam';
    return 'ground';
  }

  // ---------- the looks ----------
  // sky: colours at the top of the frame, at the horizon, and how much of each band's own
  //      light/dark variation to keep. Other families: pull hue toward `hue` by `hueAmt`,
  //      scale saturation, remap lightness to lo..hi, then wash toward `tint` by `amt`.
  const LOOKS = {
    dusk: null,   // the art as painted: a golden sunset
    dawn: {
      sky: { top: '#7a78ad', horizon: '#f5b59b', keep: 0.2 },
      blue:   { hue: 232, hueAmt: 0.35, sat: 0.5, lo: 0.2, hi: 0.72, tint: '#a3a3c2', amt: 0.18 },
      forest: { hue: 30, hueAmt: 0.25, sat: 0.7,  lo: 0.1, hi: 0.95, tint: '#474036', amt: 0.22 },
      cone:   { hue: 280, hueAmt: 0.3,  sat: 1.2,  lo: 0.05, hi: 0.95, tint: '#a58ea8', amt: 0.15 },
      ground: { hue: 355, hueAmt: 0.15, sat: 0.7,  lo: 0.04, hi: 0.92, tint: '#c9929a', amt: 0.16 },
      steam:  { hue: 350, hueAmt: 0.4,  sat: 0.3,  lo: 0.06, hi: 0.95, tint: '#efe2e0', amt: 0.3 }
    },
    morning: {
      sky: { top: '#86bfe3', horizon: '#f4e7bf', keep: 0.2 },
      blue:   { hue: 205, hueAmt: 0.3, sat: 0.9, lo: 0.1, hi: 0.95, tint: '#9cc6de', amt: 0.1 },
      forest: { hue: 95,  hueAmt: 0.45, sat: 0.9, lo: 0.04, hi: 1.05, tint: '#35512c', amt: 0.15 },
      cone:   { hue: 230, hueAmt: 0.3, sat: 1,   lo: 0.1, hi: 0.95, tint: '#b8bcc6', amt: 0.1 },
      ground: { hue: 36,  hueAmt: 0.15, sat: 0.85, lo: 0.1, hi: 0.98, tint: '#ecd3a0', amt: 0.2 },
      steam:  { hue: 40, hueAmt: 0.25, sat: 0.4, lo: 0.08, hi: 0.96, tint: '#f2eee4', amt: 0.35 }
    },
    day: {
      sky: { top: '#2f7fc8', horizon: '#a9d5ef', keep: 0.2 },
      blue:   { hue: 215, hueAmt: 0.35, sat: 0.75, lo: 0.05, hi: 0.92, tint: '#6f93b5', amt: 0.12 },
      forest: { hue: 100, hueAmt: 0.5, sat: 0.95, lo: 0.03, hi: 1.0, tint: '#2c4724', amt: 0.18 },
      cone:   { hue: 225, hueAmt: 0.2, sat: 1,    lo: 0.08, hi: 0.98, tint: '#a9adb6', amt: 0.1 },
      ground: { hue: 45,  hueAmt: 0.3, sat: 0.6,  lo: 0.14, hi: 0.98, tint: '#d9c69c', amt: 0.22 },
      steam:  { hue: 40, hueAmt: 0.25, sat: 0.35, lo: 0.1, hi: 0.96, tint: '#f1ece2', amt: 0.35 }
    },
    night: {
      sky: { top: '#0b1430', horizon: '#2a3d6b', keep: 0.15 },
      blue:   { hue: 228, hueAmt: 0.6, sat: 0.45, lo: 0.04, hi: 0.42, tint: '#1b2748', amt: 0.3 },
      forest: { hue: 160, hueAmt: 0.4, sat: 0.3, lo: 0.06, hi: 0.55, tint: '#1c2420', amt: 0.3 },
      cone:   { hue: 235, hueAmt: 0.5, sat: 1.4,  lo: 0.02, hi: 0.55, tint: '#3a4260', amt: 0.3 },
      ground: { hue: 222, hueAmt: 1, sat: 0.14, lo: 0.04, hi: 0.44, tint: '#40444f', amt: 0.35 },
      steam:  { hue: 218, hueAmt: 0.85, sat: 0.14, lo: 0.0, hi: 0.8, tint: '#b4bcc8', amt: 0.4 }
    }
  };

  // Band lightness in the painted sky runs ~0.55 (top) to ~0.75 (horizon).
  function skyInk(look, hex, yMid) {
    const t = clamp(yMid / HORIZON, 0, 1);
    const base = mix(look.sky.top, look.sky.horizon, t);
    const [h, s, l] = hexToHsl(base);
    const band = (hexToHsl(hex)[2] - (0.55 + 0.2 * t)) * look.sky.keep;
    return hslToHex([h, s, l + band]);
  }
  function grade(p, hex) {
    let [h, s, l] = hexToHsl(hex);
    h = hueMix(h, p.hue, p.hueAmt); s *= p.sat; l = p.lo + l * (p.hi - p.lo);
    return mix(hslToHex([h, s, l]), p.tint, p.amt);
  }
  const DEBUG = { sky: '#ff00ff', blue: '#0044ff', forest: '#003300', cone: '#777777', ground: '#ffbb00', steam: '#ffffff' };
  function inkAs(lookName, fam, hex, yMid) {
    if (lookName === 'families') return DEBUG[fam];
    const look = LOOKS[lookName];
    if (!look) return hex;
    return fam === 'sky' ? skyInk(look, hex, yMid) : grade(look[fam], hex);
  }

  // ---------- recolour an SVG document's text ----------
  const boxOf = (d) => {
    const nums = d.match(/-?\d+\.?\d*/g) || [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = +nums[i], y = +nums[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  };
  const avgHex = (cs) => rgbToHex(cs.map(hexToRgb).reduce((a, c) => a.map((v, i) => v + c[i] / cs.length), [0, 0, 0]));

  // opts.frame: which frame this is (for its plume area); opts.extras: stars and moon at night;
  // opts.family: treat every shape as this family (e.g. 'steam' for the message clouds)
  function recolor(svgText, lookName, opts = {}) {
    if (!LOOKS[lookName] && lookName !== 'families') return svgText;
    const plume = PLUMES[opts.frame] || null;
    // gradients: read their stops first, then decide each gradient's family from the shape that uses it
    const grads = {};
    svgText.replace(/<linearGradient id="([^"]+)"([^>]*)>([\s\S]*?)<\/linearGradient>/g, (all, id, attrs, body) => {
      const num = (k) => +(attrs.match(new RegExp(k + '="([\\d.-]+)"')) || [0, 0])[1];
      grads[id] = { ya: num('y1'), yb: num('y2'), stops: body.match(/#[0-9A-Fa-f]{6}/g) || [], fam: null };
    });
    let out = svgText.replace(/<path fill="(#[0-9A-Fa-f]{6}|url\(#[^)]+\))" d="([^"]*)"/g, (all, fill, d) => {
      const box = boxOf(d);
      if (fill[0] === 'u') {
        const g = grads[fill.slice(5, -1)];
        if (g && !g.fam && opts.family) g.fam = opts.family;
        if (g && !g.fam) {
          const cy = (box[1] + box[3]) / 2, cx = (box[0] + box[2]) / 2;
          const watery = g.stops.some((c) => { const [h, s, l] = hexToHsl(c); return h > 60 && h < 235 && s < 0.25 && l > 0.6; });
          g.fam = watery && cy > GROUND_LINE - 60 && !inBox(MOUND, cx, cy) ? 'blue' : family(avgHex(g.stops), box, plume);
        }
        return all;
      }
      const fam = opts.family || family(fill, box, plume);
      const see = '';
      return `<path fill="${inkAs(lookName, fam, fill, (box[1] + box[3]) / 2)}"${see} d="${d}"`;
    });
    out = out.replace(/<linearGradient id="([^"]+)"([^>]*)>([\s\S]*?)<\/linearGradient>/g, (all, id, attrs, body) => {
      const g = grads[id]; let i = 0;
      const body2 = body.replace(/stop-color="(#[0-9A-Fa-f]{6})"/g, (m, c) => `stop-color="${inkAs(lookName, g.fam || 'ground', c, i++ === 0 ? g.ya : g.yb)}"`);
      return `<linearGradient id="${id}"${attrs}>${body2}</linearGradient>`;
    });
    if (opts.extras && lookName === 'night') out = addNightSky(out);
    return out;
  }

  // Stars and a crescent moon, drawn over the sky bands but kept above the highest ridge (y≈436).
  function addNightSky(svg) {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let stars = '';
    for (let i = 0; i < 170; i++) {
      const x = rnd() * 2384, y = 8 + Math.pow(rnd(), 1.3) * 400, r = rnd() < 0.1 ? 1.9 : 0.6 + rnd() * 0.8;
      if (Math.hypot(x - 1790, y - 150) < 70) continue;   // not on the moon
      stars += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" fill="#f4f1e2" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`;
    }
    const moon = '<mask id="of-moon"><rect x="1700" y="60" width="200" height="200" fill="#fff"/><circle cx="1812" cy="138" r="44" fill="#000"/></mask>'
      + '<radialGradient id="of-glow"><stop offset="0.45" stop-color="#f1ecd6" stop-opacity="0.12"/><stop offset="1" stop-color="#f1ecd6" stop-opacity="0"/></radialGradient>'
      + '<circle cx="1790" cy="150" r="130" fill="url(#of-glow)"/>'
      + '<circle cx="1790" cy="150" r="46" fill="#f1ecd6" mask="url(#of-moon)"/>';
    return svg.replace(/<\/svg>\s*$/, `<g>${stars}${moon}</g></svg>`);
  }

  // What the sun is doing at Old Faithful (44.46°N, 110.83°W) at a given moment.
  function sunAt(date = new Date()) {
    const rad = Math.PI / 180, lat = 44.4605, lon = -110.8281;
    const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    const ha = ((gmst * 15 + lon) * rad - ra);
    const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
    const morning = Math.sin(ha) < 0;   // sun still climbing
    return { elevation: el, morning };
  }
  // Which look fits the sun right now.
  function lookFor(date) {
    const { elevation: e, morning } = sunAt(date);
    if (e < -8) return 'night';
    if (e < 5) return morning ? 'dawn' : 'dusk';
    if (morning) return e < 22 ? 'morning' : 'day';
    return e < 14 ? 'dusk' : 'day';
  }

  // one colour in a family's ink for a look (for things drawn in code, like spray)
  const tone = (lookName, fam, hex) => (LOOKS[lookName] ? inkAs(lookName, fam, hex, 0) : hex);
  return { LOOKS, NAMES: ['dawn', 'morning', 'day', 'dusk', 'night'], recolor, family, tone, sunAt, lookFor };
})();
