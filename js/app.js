/* Predictions, countdown, trivia delivery, controls, and the main loop. */
(() => {
  const S = OF.Scene, Snd = OF.Sound, CFG = OF.PREDICTION;
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
  };

  // ---------- time formatting ----------
  const PARK_TZ = 'America/Denver';
  const fmtPark = new Intl.DateTimeFormat('en-US', { timeZone: PARK_TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const fmtParkDay = new Intl.DateTimeFormat('en-US', { timeZone: PARK_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const fmtLocal = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const sameZone = fmtPark.format(new Date()) === fmtLocal.format(new Date());

  function fmtDur(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, sec = s % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // ---------- predictions ----------
  let pred = null;
  let lastTriggered = 0;
  const demoSoon = location.hash === '#soon';

  function estimate(now) {
    const snap = CFG.snapshot;
    const t0 = snap.prediction * 1000;
    if (now < t0 + 3 * 60e3) {
      return { time: t0, open: snap.windowOpen * 1000, close: snap.windowClose * 1000, source: 'snapshot' };
    }
    const I = CFG.averageIntervalMin * 60e3, win = CFG.estimateWindowMin * 60e3;
    const n = Math.ceil((now - 3 * 60e3 - t0) / I);
    const t = t0 + n * I;
    return { time: t, open: t - win, close: t + win, source: 'estimate' };
  }

  async function getJSON(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Our Vercel function (api/prediction.js) fetches GeyserTimes server-side; browsers can't call it directly.
  async function fetchLive() {
    const j = await getJSON(CFG.proxyUrl);
    const p = j && j.prediction;
    return p && p.time > Date.now() - 3 * 60e3 ? p : null;
  }

  async function refreshPrediction() {
    if (demoSoon && !lastTriggered) {
      const t = Date.now() + 40e3;
      pred = { time: t, open: t - 20e3, close: t + 60e3, source: 'demo' };
      renderSign(true);
      return;
    }
    const live = await fetchLive();
    pred = live || estimate(Date.now());
    renderSign(true);
  }

  const SOURCE_TEXT = {
    nps: () => 'Live NPS ranger prediction, via GeyserTimes.',
    geysertimes: () => 'Live GeyserTimes prediction. The NPS prediction isn’t posted yet.',
    snapshot: () => `NPS prediction saved ${fmtParkDay.format(new Date(CFG.snapshot.fetchedAt * 1000))}. Live data couldn’t be reached.`,
    estimate: () => `Estimate: last saved NPS prediction plus Old Faithful’s ~${CFG.averageIntervalMin}-minute average interval. Live data couldn’t be reached.`,
    demo: () => 'Test mode (#soon): a scheduled eruption in under a minute.'
  };

  // ---------- sign ----------
  const el = {
    countdown: $('countdown'), predLine: $('predLine'), localLine: $('localLine'), status: $('status'),
    source: $('source'), label: $('signLabel'), clock: $('ysClock'), blow: $('blow')
  };
  let eruptFactI = 0, eruptFactT = 0;

  function setStatus(state, text) {
    if (el.status.dataset.state !== state) el.status.dataset.state = state;
    if (el.status.textContent !== text) el.status.textContent = text;
  }

  function renderSign(full) {
    const now = Date.now();
    el.clock.textContent = fmtPark.format(new Date(now));
    const e = S.state.eruption;
    const live = e && e.kind === 'live';

    if (live) {
      el.label.textContent = 'Old Faithful is';
      el.countdown.classList.add('is-word');
      el.countdown.textContent = e.phase === 'pre' ? 'Splashing' : e.phase === 'steam' ? 'Steaming' : 'Erupting';
    } else if (pred) {
      el.label.textContent = 'Next eruption';
      const ms = pred.time - now;
      el.countdown.classList.toggle('is-word', ms <= 0);
      el.countdown.textContent = ms > 0 ? fmtDur(ms) : 'Any minute';
    }

    if (e) {
      const phaseText = { pre: 'Splashing, here it comes', ramp: 'Erupting', sustain: 'Erupting', decline: 'Winding down', steam: 'Steam phase' }[e.phase];
      setStatus(e.phase === 'steam' ? 'after' : 'erupting', e.kind === 'demo' ? `Replay · ${phaseText}` : phaseText);
    } else if (pred && now >= pred.open) {
      setStatus('window', 'Window open, watch the cone');
    } else {
      setStatus('idle', 'Steaming quietly');
    }

    if (e && e.phase !== 'pre' && e.phase !== 'steam') {
      if (now > eruptFactT) {
        el.predLine.textContent = OF.ERUPTION_FACTS[eruptFactI++ % OF.ERUPTION_FACTS.length];
        eruptFactT = now + 6000;
      }
      el.localLine.hidden = true;
      return;
    }
    if (full || now > eruptFactT) {
      if (!pred) return;
      const win = Math.round((pred.close - pred.open) / 120e3);
      el.predLine.textContent = live ? 'Next prediction after this eruption' : `Predicted ${fmtPark.format(new Date(pred.time))} · ±${win} min`;
      el.localLine.hidden = sameZone || live;
      if (!sameZone) el.localLine.textContent = `${fmtLocal.format(new Date(pred.time))} your time`;
      el.source.textContent = SOURCE_TEXT[pred.source]();
      eruptFactT = now + 60e3;
    }
  }

  // ---------- eruption hooks ----------
  S.state.onPhase = (phase, e) => {
    if (phase === 'pre') {
      el.blow.disabled = true;
      el.blow.textContent = e.kind === 'live' ? 'Erupting for real' : 'Here it comes…';
      clearTrivia();
      announce(e.kind === 'live' ? 'Old Faithful is starting to erupt.' : 'Replay eruption starting.');
      eruptFactT = 0;
    }
    if (phase === 'ramp') { announce('Old Faithful is erupting.'); el.blow.textContent = 'Erupting…'; }
    if (phase === 'decline') el.blow.textContent = 'Winding down…';
    if (phase === 'steam') { Snd.applause(); el.blow.textContent = 'Settling down…'; }
    if (phase === 'done') {
      el.blow.disabled = false;
      el.blow.textContent = 'I can’t wait, blow it up now';
      Tri.next = performance.now() / 1000 + 4;
      if (e.kind === 'live') refreshPrediction();
      renderSign(true);
    }
    renderSign(true);
  };

  let refreshing = false;
  function checkLiveTrigger() {
    if (!pred || S.state.eruption || refreshing) return;
    const now = Date.now();
    if (now >= pred.time && now < pred.time + 150e3 && lastTriggered !== pred.time) {
      lastTriggered = pred.time;
      S.startEruption('live');
    } else if (now > pred.time + 4 * 60e3) {
      refreshing = true;
      refreshPrediction().finally(() => { refreshing = false; });
    }
  }

  // ---------- trivia ----------
  const Tri = { active: null, next: performance.now() / 1000 + 4, mode: 0, seen: new Set() };
  const MODES = ['steam', 'raven', 'steam', 'bison'];
  const PREF = {
    steam: ['The geyser', 'Geology', 'The park', 'History', 'The Inn & Lodge'],
    bison: ['Wildlife', 'Ecosystem', 'History'],
    raven: null
  };
  let order = shuffle(OF.FACTS.map((_, i) => i));
  const notes = [];
  const fx = $('fx');

  function pickFact(mode) {
    const pref = PREF[mode];
    let i = order.find((k) => !Tri.seen.has(k) && (!pref || pref.includes(OF.FACTS[k].c)));
    if (i === undefined) i = order.find((k) => !Tri.seen.has(k));
    if (i === undefined) { Tri.seen.clear(); order = shuffle(order); i = order[0]; }
    Tri.seen.add(i);
    return OF.FACTS[i];
  }

  function makeNote(kind, fact, eyebrow) {
    const n = document.createElement('div');
    n.className = 'note ' + kind;
    const card = document.createElement('div');
    card.className = 'card';
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = eyebrow;
    const p = document.createElement('p');
    p.textContent = fact.t;
    card.append(cat, p);
    n.append(card);
    n.style.opacity = '0';
    fx.append(n);
    return n;
  }

  function readTime(fact) { return clamp(7 + fact.t.split(/\s+/).length * 0.32, 10, 17); }

  function deliver(now, forced) {
    let mode = forced || MODES[Tri.mode++ % MODES.length];
    const W = S.W;
    const bison = S.bisons.filter((b) => !b.calf && b.state !== 'walk' && b.fx * W > 60 && b.fx * W < W - 60);
    const raven = S.ravens.find((r) => r.state === 'off');
    if (mode === 'bison' && !bison.length) mode = 'steam';
    if (mode === 'raven' && !raven) mode = 'steam';
    const fact = pickFact(mode);
    logNote(fact);

    if (mode === 'steam') {
      const n = makeNote('steam', fact, fact.c);
      Tri.active = { mode, el: n, t: 0, dur: readTime(fact) + 3, w: n.offsetWidth, h: n.offsetHeight, drift: 0 };
      const pu = S.G.pu;
      for (let i = 0; i < 10; i++) S.steam(S.G.vx + rand(-6, 6), S.G.ventTop, rand(-6, 6) * pu, -pu * rand(40, 70), pu * rand(8, 14), pu * rand(14, 22), rand(4, 6), 0.3, 0.4, 5);
    } else if (mode === 'raven') {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const n = makeNote('raven' + (dir < 0 ? ' to-left' : ''), fact, `Raven delivery · ${fact.c}`);
      const w = n.offsetWidth, h = n.offsetHeight;
      const dur = readTime(fact) + 5;
      const speed = (W + w + 200) / dur;
      const banner = { anchor: null };
      S.launchRaven(raven, { dir, y: S.H * rand(0.13, 0.22), speed, banner });
      raven.croakT = 0.5;
      Tri.active = { mode, el: n, raven, banner, w, h, t: 0 };
    } else {
      const b = bison[(Math.random() * bison.length) | 0];
      b.state = 'paw';
      b.timer = 3.2;
      b.pawT = 0;
      const { x } = S.bisonXY(b);
      Snd.grunt((x / W) * 2 - 1);
      Tri.active = { mode, bison: b, t: 0, el: null, dur: readTime(fact) + 2, fact };
    }
  }

  function clearTrivia() {
    const a = Tri.active;
    if (!a) return;
    if (a.mode === 'steam') a.t = Math.max(a.t, a.dur - 1);
    else if (a.mode === 'bison') a.t = Math.max(a.t, 1.4 + a.dur);
    // a banner raven just keeps flying across
  }

  function updateTrivia(dt, now) {
    const a = Tri.active;
    if (!a) {
      if (!S.state.eruption && now > Tri.next) deliver(now);
      return;
    }
    a.t += dt;
    const G = S.G, W = S.W, H = S.H, u = S.u;
    let done = false;

    if (a.mode === 'steam') {
      const p = clamp(a.t / a.dur, 0, 1);
      const rise = 1 - Math.pow(1 - p, 1.6);
      a.drift += S.wind * u * 14 * dt;
      const x = clamp(G.vx + a.drift + Math.sin(a.t * 0.6) * u * 12, a.w / 2 + 16, W - a.w / 2 - 16);
      const y0 = G.ventTop - a.h / 2 - 24 * u;
      const y1 = Math.max(H * 0.16 + a.h / 2, 120 + a.h / 2);
      const y = y0 + (y1 - y0) * rise;
      const o = Math.min(1, a.t / 1.2) * Math.min(1, (a.dur - a.t) / 1.4);
      a.el.style.opacity = o.toFixed(3);
      a.el.style.transform = `translate3d(${(x - a.w / 2).toFixed(1)}px, ${(y - a.h / 2).toFixed(1)}px, 0) scale(${(0.85 + 0.15 * Math.min(1, a.t / 1.5)).toFixed(3)})`;
      if (Math.random() < dt * 9) {
        const ang = Math.random() * Math.PI * 2;
        const pu = G.pu;
        S.steam(x + Math.cos(ang) * a.w * 0.5, y + Math.sin(ang) * a.h * 0.5, rand(-5, 5) * pu, -pu * rand(4, 10), pu * rand(10, 16), pu * rand(8, 14), rand(2, 3.5), 0.22 * o, 0.3, 2);
      }
      done = a.t >= a.dur;
    } else if (a.mode === 'raven') {
      const r = a.raven;
      const left = r.dir > 0 ? r.x - 36 * r.s - a.w : r.x + 36 * r.s;
      const top = r.y + 8 * r.s;
      a.banner.anchor = { x: r.dir > 0 ? left + a.w : left, y: top + 4 };
      a.el.style.opacity = '1';
      a.el.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
      done = r.state === 'off' || !r.banner;
      if (done) r.banner = null;
    } else {
      const b = a.bison;
      const { x, y, s } = S.bisonXY(b);
      if (!a.el && a.t > 1.4) {
        a.el = makeNote('scroll', a.fact, `Dug up by a bison · ${a.fact.c}`);
        a.w = a.el.offsetWidth; a.h = a.el.offsetHeight;
        a.el.style.opacity = '1';
      }
      if (a.el) {
        const left = clamp(x + b.dir * 30 * s - a.w / 2, 16, W - a.w - 16);
        const top = Math.max(110, y - 62 * s - a.h);
        a.el.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
        if (a.t > 1.4 + a.dur && !a.el.classList.contains('out')) a.el.classList.add('out');
      }
      done = a.t > 2.2 + a.dur;
    }

    if (done) {
      const n = a.el;
      if (n) {
        n.classList.add('out');
        setTimeout(() => n.remove(), 800);
      }
      Tri.active = null;
      Tri.next = now + rand(3, 6);
    }
  }

  // ---------- field notes ----------
  const notesPanel = $('notes'), notesBtn = $('notesBtn'), notesList = $('notesList');
  function logNote(fact) {
    announce(`${fact.c}: ${fact.t}`);
    if (notes.includes(fact)) return;
    notes.unshift(fact);
    $('notesCount').textContent = notes.length;
    $('notesEmpty').hidden = true;
    const li = document.createElement('li');
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = fact.c;
    li.append(cat, document.createTextNode(fact.t));
    notesList.prepend(li);
  }
  function setNotes(open) {
    notesPanel.hidden = !open;
    notesBtn.setAttribute('aria-expanded', String(open));
    if (open) $('notesClose').focus(); else notesBtn.focus();
  }
  notesBtn.addEventListener('click', () => setNotes(notesPanel.hidden));
  $('notesClose').addEventListener('click', () => setNotes(false));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !notesPanel.hidden) setNotes(false); });

  const announcer = $('announce');
  function announce(text) { announcer.textContent = text; }

  // ---------- controls ----------
  el.blow.addEventListener('click', () => S.startEruption('demo'));

  const soundBtn = $('sound');
  soundBtn.addEventListener('click', async () => {
    const on = await Snd.toggle();
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.textContent = on ? 'Sound: on' : 'Sound: off';
  });

  const sky = $('sky');
  const savedSky = store.get('of-sky');
  if (savedSky && [...sky.options].some((o) => o.value === savedSky)) sky.value = savedSky;
  const applySky = () => { S.setSkyHour(sky.value === 'live' ? null : +sky.value); store.set('of-sky', sky.value); };
  sky.addEventListener('change', applySky);
  applySky();

  // ---------- ambient calls ----------
  let birdT = rand(4, 10);
  function ambient(dt) {
    birdT -= dt;
    if (birdT > 0 || !Snd.on) return;
    const h = S.parkHour();
    if (h > 6.5 && h < 19.8) { Snd.chickadee(rand(-0.7, 0.7)); birdT = rand(9, 22); }
    else { Snd.owl(); birdT = rand(25, 50); }
  }

  // Test hooks for local previews.
  OF.debug = { deliver: (mode) => deliver(performance.now() / 1000, mode), tick: (dt) => updateTrivia(dt, performance.now() / 1000) };

  // ---------- loop ----------
  S.resize();
  let resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(S.resize, 120); });

  let last = performance.now(), sndT = 0, signT = 0, trigT = 0;
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    const now = ts / 1000;
    S.update(dt);
    S.render(dt);
    updateTrivia(dt, now);
    ambient(dt);
    sndT -= dt;
    if (sndT < 0) {
      const e = S.state.eruption;
      Snd.update(S.wind, e ? e.level : 0, S.state.steamBoost, S.state.splashing);
      sndT = 0.1;
    }
    signT -= dt;
    if (signT < 0) { renderSign(false); signT = 0.25; }
    trigT -= dt;
    if (trigT < 0) { checkLiveTrigger(); trigT = 1; }
    requestAnimationFrame(frame);
  }

  pred = estimate(Date.now());
  renderSign(true);
  refreshPrediction();
  setInterval(() => { if (!S.state.eruption) refreshPrediction(); }, CFG.refreshMs);
  requestAnimationFrame(frame);
})();
