/* Predictions, countdown, trivia delivery, controls, and the main loop. */
(() => {
  const G = OF.Geyser, Snd = OF.Sound, CFG = OF.PREDICTION;
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- time formatting ----------
  const PARK_TZ = 'America/Denver';
  const fmtPark = new Intl.DateTimeFormat('en-US', { timeZone: PARK_TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const fmtParkDay = new Intl.DateTimeFormat('en-US', { timeZone: PARK_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const fmtLocal = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const sameZone = fmtPark.format(new Date()) === fmtLocal.format(new Date());
  const fmtTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
  const fmtParkHour = new Intl.DateTimeFormat('en-US', { timeZone: PARK_TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  function parkHour() {
    const [h, m] = fmtParkHour.format(new Date()).split(':').map(Number);
    return h + m / 60;
  }

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
    pred = live ? { ...live, fetchedAt: Date.now() } : estimate(Date.now());
    renderSign(true);
  }

  const SOURCE_TEXT = {
    nps: () => 'Live NPS ranger prediction, via GeyserTimes.',
    geysertimes: () => 'Live GeyserTimes prediction. The NPS prediction isn’t posted yet.',
    snapshot: () => `NPS prediction saved ${fmtParkDay.format(new Date(CFG.snapshot.fetchedAt * 1000))}. Live data couldn’t be reached.`,
    estimate: () => `Estimate: last saved NPS prediction plus Old Faithful’s ~${CFG.averageIntervalMin}-minute average interval. Live data couldn’t be reached.`,
    demo: () => 'Test mode (#soon): a scheduled eruption in under a minute.'
  };

  // ---------- countdown bar ----------
  const el = {
    countdown: $('countdown'), predLine: $('predLine'), status: $('status'),
    statusText: $('statusText'), statusTip: $('statusTip'), label: $('signLabel'), clock: $('ysClock'), blow: $('blow')
  };
  let eruptFactI = 0, eruptFactT = 0;
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  // Badge for where the prediction came from: "Live" when it's the park's current prediction.
  // The details (source, when we last checked) are in its hover/tap tooltip.
  function sourceTag(now) {
    const src = pred.source;
    if (src === 'nps' || src === 'geysertimes') {
      const mins = Math.max(0, Math.round((now - pred.fetchedAt) / 60e3));
      const ago = mins < 1 ? 'just now' : mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
      const who = src === 'nps' ? 'Official NPS ranger prediction, relayed by GeyserTimes.' : 'GeyserTimes prediction (the NPS one isn’t posted yet).';
      return ['live', 'Live', `${who} Checked ${ago}, at ${fmtTime.format(new Date(pred.fetchedAt))}. Refreshes every ${Math.round(CFG.refreshMs / 60e3)} minutes.`];
    }
    return { snapshot: ['saved', 'Saved', SOURCE_TEXT.snapshot()], estimate: ['saved', 'Estimate', SOURCE_TEXT.estimate()], demo: ['window', 'Test mode', SOURCE_TEXT.demo()] }[src];
  }

  function renderSign(full) {
    const now = Date.now();
    setText(el.clock, fmtPark.format(new Date(now)));
    const e = eruption;
    const live = e && e.kind === 'live';
    const steaming = e && (e.phase === 'collapse' || e.phase === 'fade');
    const ms = pred ? pred.time - now : 0;

    if (live) {
      setText(el.label, 'Old Faithful is');
      el.countdown.classList.add('is-word');
      setText(el.countdown, e.phase === 'pre' ? 'Splashing' : steaming ? 'Steaming' : 'Erupting');
    } else if (pred) {
      setText(el.label, ms <= 0 ? 'Next eruption' : now >= pred.open ? 'Window open · next eruption in' : 'Next eruption in');
      el.countdown.classList.toggle('is-word', ms <= 0);
      setText(el.countdown, ms > 0 ? fmtDur(ms) : 'Any minute');
    }

    // status: the eruption while one is on, otherwise where the prediction came from
    let state, text, tip = '';
    if (e) {
      state = steaming ? 'after' : 'erupting';
      text = e.kind === 'demo' ? 'Replay' : 'Live eruption';
      tip = e.kind === 'demo' ? 'A shortened replay. The real schedule carries on.' : 'Erupting now, on the park’s predicted schedule.';
    } else if (pred) {
      [state, text, tip] = sourceTag(now);
      if (now >= pred.open && state !== 'saved') state = 'window';
    }
    if (state) {
      if (el.status.dataset.state !== state) el.status.dataset.state = state;
      setText(el.statusText, text);
      setText(el.statusTip, tip);
    }

    if (e && e.phase !== 'pre' && !steaming) {
      if (now > eruptFactT) {
        el.predLine.textContent = OF.ERUPTION_FACTS[eruptFactI++ % OF.ERUPTION_FACTS.length];
        eruptFactT = now + 6000;
      }
      return;
    }
    if (full || now > eruptFactT) {
      if (!pred) return;
      const win = Math.round((pred.close - pred.open) / 120e3);
      const at = fmtTime.format(new Date(pred.time));
      el.predLine.textContent = live ? 'Next prediction after this eruption' : `${at}${sameZone ? '' : ' your time'} · ±${win} min`;
      eruptFactT = now + 60e3;
    }
  }

  // ---------- eruption ----------
  // The page's current eruption: { kind: 'live' | 'demo', phase }. Live eruptions run at real length,
  // the "blow it up now" replay is shortened.
  let eruption = null;
  const PHASE_TEXT = { pre: 'Splashing at the vent', rise: 'Column rising', full: 'Full eruption', die: 'Winding down', collapse: 'Steam phase', fade: 'Settling back to steam' };

  // "Now" in the strip: the geyser's state, and during an eruption a five-part stage track.
  const nowEl = { box: $('now'), text: $('nowText'), stages: [...$('stages').children] };
  const STAGE = { pre: 0, rise: 1, full: 2, die: 3, collapse: 4, fade: 4 };
  function renderNow(info) {
    const k = info.phase;
    let state, text;
    if (k === 'idle') {
      const open = pred && Date.now() >= pred.open;
      state = open ? 'window' : 'idle';
      text = open ? 'Steaming, watch the cone' : 'Lightly steaming';
    } else {
      state = k === 'collapse' || k === 'fade' ? 'after' : 'erupting';
      text = PHASE_TEXT[k];
    }
    if (nowEl.box.dataset.state !== state) nowEl.box.dataset.state = state;
    setText(nowEl.text, text);
    const cur = k === 'idle' ? -1 : STAGE[k];
    // the steam stage spans two timeline phases
    const plan = G.PLANS[G.plan];
    const p = k === 'collapse' ? info.p * plan.collapse / (plan.collapse + plan.fade)
      : k === 'fade' ? (plan.collapse + info.p * plan.fade) / (plan.collapse + plan.fade) : info.p;
    nowEl.stages.forEach((li, i) => {
      li.toggleAttribute('data-done', i < cur);
      li.toggleAttribute('aria-current', i === cur);
      li.style.setProperty('--fill', i === cur ? p.toFixed(3) : i < cur ? 1 : 0);
    });
  }

  // The button starts a replay, and can cut a replay short. A real eruption can't be stopped.
  const BLOW = { start: 'Hurry it up, you old geezer!', stop: 'Okay, okay. Put a lid on it!', stopping: 'Fine, simmering down…' };
  function setBlow(text, enabled) { setText(el.blow, text); el.blow.disabled = !enabled; }

  function startEruption(kind) {
    eruption = { kind, phase: 'pre' };
    if (kind === 'live') setBlow('Erupting for real', false);
    else setBlow(BLOW.stop, true);
    clearTrivia();
    announce(kind === 'live' ? 'Old Faithful is starting to erupt.' : 'Replay eruption starting.');
    eruptFactT = 0;
    G.start(kind === 'live' ? 'live' : 'demo');
  }

  G.onPhase = (phase) => {
    const e = eruption;
    if (!e) return;
    if (phase === 'idle') {
      eruption = null;
      setBlow(BLOW.start, true);
      Tri.next = Math.max(Tri.next, performance.now() / 1000 + 15);   // a breather after an eruption
      if (e.kind === 'live') refreshPrediction();
      renderSign(true);
      return;
    }
    e.phase = phase;
    const live = e.kind === 'live';
    if (phase === 'rise' || phase === 'pre') OF.Birds.startle();
    if (phase === 'rise') { announce('Old Faithful is erupting.'); if (live) setBlow('Erupting…', false); }
    if (phase === 'die' && live) setBlow('Winding down…', false);
    if (phase === 'collapse') { if (!e.stopping) Snd.applause(); if (live) setBlow('Settling down…', false); }
    renderSign(true);
  };

  let refreshing = false;
  function checkLiveTrigger() {
    if (!pred || eruption || refreshing) return;
    const now = Date.now();
    if (now >= pred.time && now < pred.time + 150e3 && lastTriggered !== pred.time) {
      lastTriggered = pred.time;
      startEruption('live');
    } else if (now > pred.time + 4 * 60e3) {
      refreshing = true;
      refreshPrediction().finally(() => { refreshing = false; });
    }
  }

  // ---------- sky: time of day ----------
  // "Park time" follows the sun at Old Faithful; the others fix a look. Remembered on this device.
  const SKIES = ['live', 'dawn', 'morning', 'day', 'dusk', 'night'];
  const SKY_NAME = { live: 'Park time', dawn: 'Dawn', morning: 'Morning', day: 'Day', dusk: 'Dusk', night: 'Night' };
  const sky = {
    mode: (() => {
      const hash = location.hash.match(/sky=(\w+)/);
      if (hash && SKIES.includes(hash[1])) return hash[1];
      try { const v = localStorage.getItem('of-sky'); return SKIES.includes(v) ? v : 'live'; } catch { return 'live'; }
    })(),
    look() { return this.mode === 'live' ? OF.Palette.lookFor(new Date()) : this.mode; },
    apply() {
      const lk = this.look();
      G.setLook(lk); M.setLook(lk); OF.Birds.setLook(lk);
      document.documentElement.dataset.look = lk;
      setText($('sky'), `Sky · ${SKY_NAME[this.mode]}`);
      $('sky').setAttribute('aria-label', `Sky: ${SKY_NAME[this.mode]}${this.mode === 'live' ? ` (${lk} at Old Faithful now)` : ''}. Change time of day`);
    }
  };
  $('sky').addEventListener('click', () => {
    sky.mode = SKIES[(SKIES.indexOf(sky.mode) + 1) % SKIES.length];
    try { localStorage.setItem('of-sky', sky.mode); } catch { /* storage unavailable */ }
    sky.apply();
  });
  setInterval(() => { if (sky.mode === 'live') sky.apply(); }, 60e3);   // the sun moves on

  // ---------- trivia ----------
  // Each fact rises out of the vent in a faint cloud of steam (js/steam-message.js).
  // Animal carriers come back with the animal art.
  const M = OF.SteamMessage;
  // The facts are spread across the ~90 minutes between eruptions: one starts about every 86 s
  // (59 facts over ~85 quiet minutes), give or take a little so it doesn't feel mechanical.
  const FACT_EVERY = 86, FACT_JITTER = 12;
  const Tri = { active: null, next: performance.now() / 1000 + 4, seen: new Set(), ready: false };
  let order = shuffle(OF.FACTS.map((_, i) => i));
  const notes = [];
  let wind = 0.4;
  const msgOpts = {
    layer: $('fx'),
    vent: () => G.vent(),
    safe: () => {
      const title = document.querySelector('.title').getBoundingClientRect();
      const bar = [...document.querySelector('.bar').children].map((c) => c.getBoundingClientRect().top);
      return { top: title.bottom + 8, bottom: innerHeight - Math.min(...bar) + 16 };
    }
  };
  M.load(sky.look()).then(() => { Tri.ready = true; });

  function pickFact() {
    let i = order.find((k) => !Tri.seen.has(k));
    if (i === undefined) { Tri.seen.clear(); order = shuffle(order); i = order[0]; }
    Tri.seen.add(i);
    return OF.FACTS[i];
  }

  function deliver() {
    if (!Tri.ready) return;
    const fact = pickFact();
    logNote(fact);
    Tri.active = M.create(fact, msgOpts);
    Tri.next = performance.now() / 1000 + FACT_EVERY + rand(-FACT_JITTER, FACT_JITTER);
  }

  function clearTrivia() {
    if (Tri.active) Tri.active.evaporate();
  }

  function updateTrivia(dt, now) {
    const a = Tri.active;
    if (!a) {
      if (!eruption && now > Tri.next) deliver();
      return;
    }
    a.update(dt);
    if (a.done) Tri.active = null;
  }

  // ---------- field notes ----------
  const notesPanel = $('notes'), notesBtn = $('notesBtn'), notesList = $('notesList');
  function logNote(fact) {
    announce(`${fact.c}: ${fact.t}`);
    if (notes.includes(fact)) return;
    notes.push(fact);
    $('notesCount').textContent = notes.length;
    $('notesCount').hidden = false;
    $('notesEmpty').hidden = true;
    // numbered in the order they were spotted: 01, 02, …
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(notes.length).padStart(2, '0');
    const body = document.createElement('div');
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = fact.c;
    const p = document.createElement('p');
    p.textContent = fact.t;
    body.append(cat, p);
    li.append(num, body);
    notesList.append(li);
  }
  function setNotes(open) {
    notesPanel.hidden = !open;
    notesBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      const b = $('notesBody');
      b.scrollTop = b.scrollHeight;   // newest at the bottom
      $('notesClose').focus();
    } else notesBtn.focus();
  }
  notesBtn.addEventListener('click', () => setNotes(notesPanel.hidden));
  $('notesClose').addEventListener('click', () => setNotes(false));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !notesPanel.hidden) setNotes(false); });

  const announcer = $('announce');
  function announce(text) { announcer.textContent = text; }

  // ---------- controls ----------
  el.blow.addEventListener('click', () => {
    if (!eruption) startEruption('demo');
    else if (eruption.kind === 'demo' && !eruption.stopping) {
      eruption.stopping = true;
      setBlow(BLOW.stopping, false);
      announce('Replay stopped.');
      G.windDown();
    }
  });

  const soundBtn = $('sound');
  soundBtn.addEventListener('click', async () => {
    const on = await Snd.toggle();
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.textContent = on ? 'Sound on' : 'Sound off';
  });

  // iOS pauses web audio when the page is hidden or interrupted; resume on return or the next tap.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Snd.wake(); });
  document.addEventListener('pointerdown', () => Snd.wake());

  // ---------- ambient calls ----------
  let birdT = rand(4, 10);
  function ambient(dt) {
    birdT -= dt;
    if (birdT > 0 || !Snd.on) return;
    const h = parkHour();
    if (h > 6.5 && h < 19.8) { Snd.chickadee(rand(-0.7, 0.7)); birdT = rand(9, 22); }
    else { Snd.owl(); birdT = rand(25, 50); }
  }

  // Test hooks for local previews.
  OF.debug = { deliver, tick: (dt) => updateTrivia(dt, performance.now() / 1000), erupt: startEruption };

  // ---------- loop ----------
  // On narrow screens the dock spans the bottom, so the art is fitted to keep the vent above it.
  const dock = document.querySelector('.bar');
  function dockInset(W, H) {
    let inset = 0;
    for (const c of dock.children) {
      const r = c.getBoundingClientRect();
      if (r.left < W / 2 + 120 && r.right > W / 2 - 120) inset = Math.max(inset, H - r.top);
    }
    return inset;
  }
  G.mount($('scene'), { inset: dockInset, look: sky.look() });
  // birds fly in the sky between the title and the mountains
  OF.Birds.mount($('scene'), {
    top: () => document.querySelector('.title').getBoundingClientRect().bottom,
    horizon: () => { const v = G.vent(); return (v.y - 268 * v.scale) / innerHeight; },
    // art units to screen px (the art is scaled and shifted to fit the window)
    toScreen: (ax, ay) => { const v = G.vent(); return { x: v.x + (ax - 1215) * v.scale, y: v.y + (ay - 738) * v.scale }; },
    // a spot on the basin floor beside the geyser (art units), if it isn't hidden by the strip
    ground: () => {
      // right of the mound: sand (the left side has a pale pool along the forest edge)
      const v = G.vent(), ax = 1540 + Math.random() * 260, ay = 768 + Math.random() * 14;
      const x = v.x + (ax - 1215) * v.scale, y = v.y + (ay - 738) * v.scale;
      const barTop = Math.min(...[...document.querySelector('.bar').children].map((c) => c.getBoundingClientRect().top));
      return x > 30 && x < innerWidth - 30 && y < barTop - 16 ? { ax, ay } : null;
    }
  });
  // Test hook: #birds sends a crossing every few seconds.
  if (location.hash.includes('birds') && !location.hash.includes('birdsnap')) {
    setInterval(() => OF.Birds.launch(), 3000);
    const come = () => { if (!OF.Birds.land()) setTimeout(come, 500); };
    setTimeout(come, 1500);
  }
  // #birdsnap: a few crossings already mid-sky (for screenshots)
  if (location.hash.includes('birdsnap')) {
    const down = () => (OF.Birds.land() ? OF.Birds.tick(30) : setTimeout(down, 200));   // one raven already down (once its art has loaded)
    down();
    for (let i = 0; i < 2; i++) { OF.Birds.launch(); OF.Birds.tick(2.5 + i * 1.3); }
  }
  sky.apply();
  // Test hook: #notes fills in a few field notes and opens the panel.
  if (location.hash.includes('notes')) { for (let i = 0; i < 6; i++) logNote(pickFact()); setNotes(true); }
  // Test hook: #erupt=<seconds> starts a replay and jumps that far into it.
  const jump = location.hash.match(/erupt=([\d.]+)/);
  if (jump) G.ready.then(() => { startEruption('demo'); G.seek(+jump[1]); });
  addEventListener('resize', () => { G.fit(); OF.Birds.fit(); if (Tri.active) Tri.active.layout(); });
  if (window.ResizeObserver) new ResizeObserver(() => G.fit()).observe(dock);   // e.g. fonts arriving

  let last = performance.now(), sndT = 0, signT = 0, trigT = 0, clockT = 0;
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts; clockT += dt;
    const now = ts / 1000;
    const info = G.tick(dt);
    OF.Birds.tick(dt);
    renderNow(info);
    wind = 0.4 + 0.15 * Math.sin(clockT * 0.07) + 0.08 * Math.sin(clockT * 0.23);
    updateTrivia(dt, now);
    ambient(dt);
    sndT -= dt;
    if (sndT < 0) {
      Snd.update(wind, info.level, Math.max(0.2, info.steam), info.splashing);
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
  setInterval(() => { if (!eruption) refreshPrediction(); }, CFG.refreshMs);
  requestAnimationFrame(frame);
})();
