/* Sound, synthesized with the Web Audio API so there are no audio files to license or load.
   Browsers only allow audio after a click, so nothing plays until the viewer turns sound on. */
window.OF = window.OF || {};

OF.Sound = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  const S = {
    on: false,
    ctx: null,

    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const c = (this.ctx = new AC());
      const sr = c.sampleRate, n = sr * 4;

      // Four seconds each of white and brown noise, looped. Brown noise is the base for wind and rumble.
      const white = c.createBuffer(1, n, sr), brown = c.createBuffer(1, n, sr);
      const wd = white.getChannelData(0), bd = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        wd[i] = w;
        last = (last + 0.02 * w) / 1.02;
        bd[i] = last * 3.5;
      }
      this.white = white;
      this.brown = brown;

      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.connect(c.destination);

      const loop = (buf) => {
        const s = c.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        s.start(0, Math.random() * 3);
        return s;
      };
      const filt = (type, f, q = 0.7) => {
        const b = c.createBiquadFilter();
        b.type = type; b.frequency.value = f; b.Q.value = q;
        return b;
      };
      const gain = () => { const g = c.createGain(); g.gain.value = 0; return g; };
      const chain = (...nodes) => {
        for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
        nodes[nodes.length - 1].connect(this.master);
        return nodes[nodes.length - 1];
      };

      this.windF = filt('lowpass', 500, 0.6);
      this.windG = chain(loop(brown), this.windF, gain());
      this.hissG = chain(loop(white), filt('bandpass', 2800, 0.7), gain());
      this.roarG = chain(loop(brown), filt('lowpass', 900, 0.5), gain());
      this.jetG = chain(loop(white), filt('bandpass', 1300, 0.5), gain());
      this.rumbleG = chain(loop(brown), filt('lowpass', 110, 0.7), gain());
      return true;
    },

    async toggle() {
      if (!this.ctx && !this.init()) return false;
      this.on = !this.on;
      if (this.on) {
        this.phoneSession(true);
        if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
        this.chickadee(0);   // something to hear straight away, even if the scene is quiet
      } else this.phoneSession(false);
      this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.3);
      return this.on;
    },

    // iPhones mute web audio when the ring/silent switch is on silent. Declaring this as media
    // playback (newer Safari), or playing a silent audio element alongside it (older Safari), makes it
    // play like a video does.
    phoneSession(on) {
      try { if (navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto'; } catch { /* unsupported */ }
      if (!on) { if (this.tag) this.tag.pause(); return; }
      if (!this.tag) {
        const rate = 8000, n = rate / 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
        const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
        str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
        str(36, 'data'); v.setUint32(40, n * 2, true);
        this.tag = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
        this.tag.loop = true;
        this.tag.setAttribute('playsinline', '');
      }
      this.tag.play().catch(() => { /* blocked; web audio may still play */ });
    },

    // iOS suspends audio when the page is hidden or a call comes in; pick up again on return.
    wake() {
      if (this.on && this.ctx && this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
        if (this.tag) this.tag.play().catch(() => {});
      }
    },

    set(g, v) { g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25); },

    // Called ~10x a second with the scene state.
    update(wind, level, steamBoost, splashing) {
      if (!this.on) return;
      const t = this.ctx.currentTime;
      this.set(this.windG, 0.05 + 0.08 * wind);
      this.windF.frequency.setTargetAtTime(500 + 700 * wind, t, 0.6);   // high enough for phone speakers
      this.set(this.hissG, 0.018 + 0.03 * steamBoost + 0.04 * splashing);
      this.set(this.roarG, 0.5 * Math.pow(level, 1.3));
      this.set(this.jetG, 0.16 * level);
      this.set(this.rumbleG, 0.75 * level);
    },

    out(node, pan) {
      if (pan && this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        node.connect(p).connect(this.master);
      } else node.connect(this.master);
    },

    burst({ dur = 0.2, f = 1500, q = 1, g = 0.2, type = 'bandpass', at = 0, pan = 0, buf = 'white' }) {
      const c = this.ctx, t = c.currentTime + at;
      const s = c.createBufferSource();
      s.buffer = this[buf];
      const fl = c.createBiquadFilter();
      fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gn = c.createGain();
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.linearRampToValueAtTime(g, t + Math.min(0.01, dur * 0.2));
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl).connect(gn);
      this.out(gn, pan);
      s.start(t, Math.random() * 3, dur + 0.05);
    },

    tone({ f0, f1, dur, g = 0.05, type = 'sine', at = 0, pan = 0, filter }) {
      const c = this.ctx, t = c.currentTime + at;
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1 || f0, t + dur);
      const gn = c.createGain();
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(g, t + Math.min(0.04, dur * 0.25));
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let n = o;
      if (filter) {
        const fl = c.createBiquadFilter();
        fl.type = filter.type; fl.frequency.value = filter.f; fl.Q.value = filter.q || 1;
        n.connect(fl); n = fl;
      }
      n.connect(gn);
      this.out(gn, pan);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    // Black-capped chickadee "fee-bee".
    chickadee(pan) {
      if (!this.on) return;
      this.tone({ f0: 3950, f1: 3900, dur: 0.28, g: 0.03, pan });
      this.tone({ f0: 3450, f1: 3380, dur: 0.34, g: 0.026, at: 0.38, pan });
    },

    // Great horned owl: hoo, hoo-hoo, hoo, hoo.
    owl() {
      if (!this.on) return;
      [0, 0.9, 1.12, 1.6, 2.2].forEach((a, i) =>
        this.tone({ f0: i === 2 ? 360 : 390, f1: 340, dur: i === 2 ? 0.18 : 0.42, g: 0.05, at: a }));
    },

    croak(pan) {
      if (!this.on) return;
      for (let i = 0; i < 2; i++)
        this.tone({ f0: 430, f1: 320, dur: 0.24, g: 0.08, type: 'sawtooth', at: i * 0.34, pan,
          filter: { type: 'bandpass', f: 1100, q: 3 } });
    },

    grunt(pan) {
      if (!this.on) return;
      this.tone({ f0: 78, f1: 55, dur: 0.7, g: 0.2, type: 'sawtooth', pan,
        filter: { type: 'lowpass', f: 260, q: 1 } });
    },

    splash(g = 0.25) {
      if (!this.on) return;
      this.burst({ dur: 0.5, f: 900, q: 0.4, g });
      this.burst({ dur: 0.9, f: 300, q: 0.5, g: g * 0.8, type: 'lowpass', buf: 'brown' });
    },

    applause() {
      if (!this.on) return;
      const n = 120;
      for (let i = 0; i < n; i++) {
        const a = Math.pow(i / n, 0.8) * 4 + Math.random() * 0.08;
        this.burst({ dur: 0.03, f: rand(1000, 2600), q: 1.2, g: 0.11 * (1 - a / 4.6) * rand(0.4, 1), at: a, pan: rand(-0.8, 0.8) });
      }
    }
  };
  return S;
})();
