// All sound is made here with WebAudio. Nothing plays, and no context exists, until "Enable sound" is clicked.
const CHIME = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568];
export class Sound {
  constructor() { this.on = false; this.ctx = null; }
  toggle() {
    if (!this.ctx) this.init();
    this.on = !this.on; this.master.gain.setTargetAtTime(this.on ? 0.8 : 0, this.ctx.currentTime, 0.03);
    if (this.on) this.ctx.resume(); return this.on;
  }
  init() {
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain(); this.master.gain.value = 0; const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; this.master.connect(comp); comp.connect(c.destination);
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); let b = 0;
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.white = buf;
    const buf2 = c.createBuffer(1, n, c.sampleRate), d2 = buf2.getChannelData(0); for (let i = 0; i < n; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d2[i] = b * 3.5; } this.brown = buf2;
    // rolling rumble of the table ball
    const src = c.createBufferSource(); src.buffer = buf2; src.loop = true; this.rLP = c.createBiquadFilter(); this.rLP.type = 'lowpass'; this.rLP.frequency.value = 120;
    this.rG = c.createGain(); this.rG.gain.value = 0; this.rPan = c.createStereoPanner(); src.connect(this.rLP); this.rLP.connect(this.rG); this.rG.connect(this.rPan); this.rPan.connect(this.master); src.start();
    const src2 = c.createBufferSource(); src2.buffer = buf; src2.loop = true; this.rBP = c.createBiquadFilter(); this.rBP.type = 'bandpass'; this.rBP.frequency.value = 700; this.rBP.Q.value = 2.5;
    this.rG2 = c.createGain(); this.rG2.gain.value = 0; src2.connect(this.rBP); this.rBP.connect(this.rG2); this.rG2.connect(this.rPan); src2.start();
    // transformer hum under the playfield
    this.hG = c.createGain(); this.hG.gain.value = 0; for (const [f, v] of [[120, 1], [240, 0.35], [360, 0.12]]) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.value = v; o.connect(g); g.connect(this.hG); o.start(); } this.hG.connect(this.master);
  }
  out(pan) { const p = this.ctx.createStereoPanner(); p.pan.value = pan || 0; p.connect(this.master); return p; }
  tone(f, dur, vol, pan, type = 'sine', f2 = 0, t0 = 0) {
    const c = this.ctx, t = c.currentTime + t0, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.out(pan)); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, pan, type, freq, q = 1, t0 = 0, f2 = 0) {
    const c = this.ctx, t = c.currentTime + t0, s = c.createBufferSource(); s.buffer = this.white; const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur); f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(Math.max(vol, 0.0002), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(this.out(pan)); s.start(t, Math.random() * 1.5, dur + 0.05);
  }
  chime(f, vol, pan, t0 = 0, len = 1.3) { for (const [m, v, d] of [[1, 1, 1], [2.76, 0.45, 0.55], [5.4, 0.22, 0.3], [8.93, 0.1, 0.16]]) this.tone(f * m, len * d, vol * v, pan, 'sine', 0, t0); this.noise(0.012, vol * 0.5, pan, 'bandpass', 3000, 1, t0); }
  bell(f, vol, pan, t0 = 0) { for (const [m, v, d] of [[0.56, 0.5, 1], [0.92, 0.6, 0.9], [1.19, 0.5, 0.7], [1.71, 0.35, 0.5], [2, 0.6, 0.6], [2.74, 0.3, 0.35], [3.76, 0.2, 0.25], [4.07, 0.15, 0.2]]) this.tone(f * m, 1.6 * d, vol * v * 0.5, pan, 'sine', 0, t0); }
  thump(vol, pan, t0 = 0, f = 78) { this.tone(f, 0.12, vol, pan, 'sine', f * 0.5, t0); this.noise(0.035, vol * 0.7, pan, 'lowpass', 900, 0.7, t0); this.noise(0.01, vol * 0.35, pan, 'highpass', 2500, 0.7, t0); }
  ring(vol, pan, f = 3100) { for (const [m, d] of [[1, 0.3], [1.51, 0.22], [2.02, 0.16], [2.9, 0.1]]) this.tone(f * m * (0.97 + Math.random() * 0.06), d, vol * 0.22, pan); this.noise(0.006, vol * 0.3, pan, 'highpass', 4000); }
  ev(type, v, pan, n) {
    if (!this.on) return; v = Math.min(1, v);
    switch (type) {
      case 'pull': this.noise(0.5, 0.05, 0.3, 'bandpass', 900, 6, 0, 1900); for (let i = 0; i < 7; i++) this.noise(0.008, 0.07, 0.3, 'highpass', 3500, 1, i * 0.075); break;
      case 'fire': this.thump(0.5 * v + 0.2, 0.25, 0, 110); this.tone(240, 0.28, 0.16 * v, 0.25, 'triangle', 150); this.tone(1900, 0.09, 0.06, 0.25, 'square', 900); this.noise(0.12, 0.12 * v, 0.2, 'bandpass', 2400, 1.5, 0, 700); break;
      case 'land': this.noise(0.02, 0.2 * v, pan, 'bandpass', 1500, 2); this.tone(260, 0.05, 0.12 * v, pan); break;
      case 'tick': this.noise(0.012, 0.12 * v, pan, 'highpass', 3000); break;
      case 'wood': this.noise(0.04, 0.3 * v, pan, 'lowpass', 600); this.tone(190, 0.06, 0.2 * v, pan); break;
      case 'steel': this.ring(v, pan, 2900 + Math.random() * 600); break;
      case 'ping': this.ring(v * 1.3, pan, 2300); this.tone(620, 0.25, 0.1 * v, pan); break;
      case 'rubber': this.tone(210, 0.07, 0.28 * v, pan, 'sine', 120); this.noise(0.02, 0.1 * v, pan, 'lowpass', 1200); break;
      case 'glass': this.tone(5200, 0.18, 0.1, pan); this.tone(7300, 0.12, 0.06, pan); break;
      case 'drop': this.noise(0.03, 0.6 * v, pan, 'bandpass', 1700, 1.2); this.thump(0.5 * v, pan, 0.012, 95); this.chime(CHIME[n], 0.3 + 0.2 * v, pan * 0.5, 0.05); break;
      case 'bankshot': this.chime(1568, 0.25, 0, 0.16, 0.7); this.chime(2093, 0.25, 0, 0.26, 0.7); break;
      case 'bankdone': for (let i = 0; i < 5; i++) this.bell(880 * (1 + n * 0.12), 0.38, 0, 0.12 + i * 0.11); this.thump(0.5, 0, 0.1, 60); break;
      case 'reset': this.thump(0.9 * v + 0.2, pan, 0, 62); this.noise(0.05, 0.4, pan, 'bandpass', 1300, 1, 0.02); break;
      case 'warn': this.tone(1400, 0.05, 0.1, pan, 'square'); break;
      case 'bumper': this.thump(0.9 * v + 0.15, pan, 0, 85); this.bell(1320, 0.22 * v + 0.05, pan, 0.01); break;
      case 'sling': this.thump(0.8 * v + 0.1, pan, 0, 100); this.noise(0.03, 0.3 * v, pan, 'bandpass', 2200, 2); break;
      case 'flipper': this.thump(0.8 * v + 0.1, pan, 0, 70); this.noise(0.04, 0.35 * v, pan, 'bandpass', 1100, 1.5, 0.02); break;
      case 'standup': this.bell(1760, 0.3, pan); this.noise(0.02, 0.3, pan, 'bandpass', 2600, 2); break;
      case 'spin': this.noise(0.012, 0.25 * v + 0.05, pan, 'bandpass', 3200, 3); this.tone(1900, 0.03, 0.05, pan, 'square'); break;
      case 'rollover': this.noise(0.012, 0.3, pan, 'bandpass', 2000, 2); this.chime(1046.5, 0.14, pan, 0.02, 0.5); break;
      case 'reel': this.noise(0.014, 0.1, 0, 'bandpass', 2400 + n * 150, 3); break;
      case 'gate': this.ring(0.25, pan, 4200); break;
      case 'bigknock': this.tone(150, 0.1, 0.5 * v, pan, 'sine', 80); if (n === 1) this.ring(v * 0.8, pan, 1500); else this.noise(0.04, 0.3 * v, pan, 'lowpass', 700); break;
      case 'bigrubber': this.tone(170, 0.11, 0.5 * v, pan, 'sine', 90); break;
      case 'nudge': this.thump(0.7, 0, 0, 48); this.noise(0.2, 0.1, 0, 'lowpass', 300); break;
      case 'saucer': case 'eject': this.thump(0.8 * v + 0.1, pan, 0, 66); this.ring(0.3, pan, 1700); break;
      case 'plunk': case 'drain': this.tone(420, 0.09, 0.2 * v, pan, 'sine', 160); this.noise(0.05, 0.1, pan, 'lowpass', 500, 1, 0.05); break;
      case 'toss': this.noise(0.14, 0.2, pan, 'bandpass', 500, 1.5, 0, 1800); this.thump(0.25, pan, 0, 120); break;
      case 'ringland': this.tone(140, 0.06, 0.12, pan); break;
      case 'ringhit': case 'stagger': this.tone(110, 0.16, 0.5, 0, 'sine', 60); this.noise(0.06, 0.25, 0, 'lowpass', 500); break;
      case 'stun': this.bell(1175, 0.3, pan); this.noise(0.4, 0.12, pan, 'bandpass', 2600, 4, 0, 600); break;
      case 'hit': this.tone(90, 0.4, 0.9, 0, 'sine', 38); this.noise(0.18, 0.5, 0, 'lowpass', 800); this.ring(0.7, 0, 1100); break;
      case 'restart': this.tone(330, 0.5, 0.25, 0, 'triangle', 110); this.thump(0.6, 0, 0.3, 55); break;
      case 'win': [0, 2, 4, 5, 7, 8].forEach((k, i) => this.chime(CHIME[k], 0.4, 0, i * 0.13, 1.6)); for (let i = 0; i < 14; i++) this.bell(1320, 0.22, 0, 0.9 + i * 0.09); break;
    }
  }
  rumble(speed, dist, pan) {
    if (!this.on) return; const t = this.ctx.currentTime, att = 1 / (1 + dist * dist / 320), s = Math.min(1, speed / 42);
    this.rG.gain.setTargetAtTime(s * (0.25 + 0.75 * att) * 0.75, t, 0.06); this.rG2.gain.setTargetAtTime(s * att * 0.07, t, 0.06);
    this.rLP.frequency.setTargetAtTime(70 + speed * 4 + att * 260, t, 0.08); this.rBP.frequency.setTargetAtTime(350 + speed * 16, t, 0.08); this.rPan.pan.setTargetAtTime(pan, t, 0.08);
  }
  hum(level) { if (this.on) this.hG.gain.setTargetAtTime(0.004 + 0.012 * level, this.ctx.currentTime, 0.3); }
}
