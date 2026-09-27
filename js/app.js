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
    countdown: $('countdown'), predLine: $('predLine'), localLine: $('localLine'), status: $('status'),
    statusText: $('statusText'), label: $('signLabel'), clock: $('ysClock'), blow: $('blow')
  };
  let eruptFactI = 0, eruptFactT = 0;
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  // Short tag for where the prediction came from, e.g. "Live · NPS · 2m ago". The full sentence is its tooltip.
  function sourceTag(now) {
    const ago = pred.fetchedAt ? ` · ${Math.max(0, Math.round((now - pred.fetchedAt) / 60e3))}m ago` : '';
    return {
      nps: ['live', `Live · NPS${ago}`],
      geysertimes: ['live', `Live · GeyserTimes${ago}`],
      snapshot: ['saved', 'Saved NPS prediction'],
      estimate: ['saved', 'Estimate'],
      demo: ['window', 'Test mode']
    }[pred.source];
  }

  function renderSign(full) {
    const now = Date.now();
    el.clock.textContent = fmtPark.format(new Date(now));
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
    let state, text;
    if (e) {
      state = steaming ? 'after' : 'erupting';
      text = e.kind === 'demo' ? 'Replay' : 'Live eruption';
    } else if (pred) {
      [state, text] = sourceTag(now);
      if (now >= pred.open && state !== 'saved') state = 'window';
    }
    if (state) {
      if (el.status.dataset.state !== state) el.status.dataset.state = state;
      setText(el.statusText, text);
    }

    if (e && e.phase !== 'pre' && !steaming) {
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
      el.predLine.textContent = live ? 'Next prediction after this eruption' : `${fmtPark.format(new Date(pred.time))} · ±${win} min`;
      el.localLine.hidden = sameZone || live;
      if (!sameZone) el.localLine.textContent = `${fmtLocal.format(new Date(pred.time))} your time`;
      el.status.title = SOURCE_TEXT[pred.source]();
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

  function startEruption(kind) {
    eruption = { kind, phase: 'pre' };
    el.blow.disabled = true;
    el.blow.textContent = kind === 'live' ? 'Erupting for real' : 'Here it comes…';
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
      el.blow.disabled = false;
      el.blow.textContent = 'Hurry it up, geyser';
      Tri.next = performance.now() / 1000 + 4;
      if (e.kind === 'live') refreshPrediction();
      renderSign(true);
      return;
    }
    e.phase = phase;
    if (phase === 'rise') { announce('Old Faithful is erupting.'); el.blow.textContent = 'Erupting…'; }
    if (phase === 'die') el.blow.textContent = 'Winding down…';
    if (phase === 'collapse') { Snd.applause(); el.blow.textContent = 'Settling down…'; }
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

  // ---------- trivia ----------
  // For now every fact rises out of the vent in a puff of steam. Animal carriers come back with the animal art.
  const Tri = { active: null, next: performance.now() / 1000 + 4, seen: new Set() };
  let order = shuffle(OF.FACTS.map((_, i) => i));
  const notes = [];
  const fx = $('fx');
  let wind = 0.4;

  function pickFact() {
    let i = order.find((k) => !Tri.seen.has(k));
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

  function deliver() {
    const fact = pickFact();
    logNote(fact);
    const n = makeNote('steam', fact, fact.c);
    Tri.active = { el: n, t: 0, dur: readTime(fact) + 3, w: n.offsetWidth, h: n.offsetHeight, drift: 0 };
    G.puff(4);
  }

  function clearTrivia() {
    const a = Tri.active;
    if (a) a.t = Math.max(a.t, a.dur - 1);
  }

  function updateTrivia(dt, now) {
    const a = Tri.active;
    if (!a) {
      if (!eruption && now > Tri.next) deliver();
      return;
    }
    a.t += dt;
    const W = innerWidth, H = innerHeight, v = G.vent(), u = v.scale;
    const p = clamp(a.t / a.dur, 0, 1);
    const rise = 1 - Math.pow(1 - p, 1.6);
    a.drift += wind * u * 30 * dt;
    const x = clamp(v.x + a.drift + Math.sin(a.t * 0.6) * u * 24, a.w / 2 + 16, W - a.w / 2 - 16);
    const y0 = v.y - a.h / 2 - 50 * u;
    const y1 = Math.max(H * 0.16 + a.h / 2, 120 + a.h / 2);
    const y = y0 + (y1 - y0) * rise;
    const o = Math.min(1, a.t / 1.2) * Math.min(1, (a.dur - a.t) / 1.4);
    a.el.style.opacity = o.toFixed(3);
    a.el.style.transform = `translate3d(${(x - a.w / 2).toFixed(1)}px, ${(y - a.h / 2).toFixed(1)}px, 0) scale(${(0.85 + 0.15 * Math.min(1, a.t / 1.5)).toFixed(3)})`;
    if (a.t >= a.dur) {
      const n = a.el;
      n.classList.add('out');
      setTimeout(() => n.remove(), 800);
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
    $('notesCount').hidden = false;
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
  el.blow.addEventListener('click', () => { if (!eruption) startEruption('demo'); });

  const soundBtn = $('sound');
  soundBtn.addEventListener('click', async () => {
    const on = await Snd.toggle();
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.textContent = on ? 'Sound on' : 'Sound off';
  });

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
  G.mount($('scene'), { inset: dockInset });
  // Test hook: #erupt=<seconds> starts a replay and jumps that far into it.
  const jump = location.hash.match(/erupt=([\d.]+)/);
  if (jump) G.ready.then(() => { startEruption('demo'); G.seek(+jump[1]); });
  addEventListener('resize', G.fit);
  if (window.ResizeObserver) new ResizeObserver(() => G.fit()).observe(dock);   // e.g. fonts arriving

  let last = performance.now(), sndT = 0, signT = 0, trigT = 0, clockT = 0;
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts; clockT += dt;
    const now = ts / 1000;
    const info = G.tick(dt);
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
