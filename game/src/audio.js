// Synthesised sound: every effect is a small WebAudio patch, no audio files.
// The bank stays silent until the player first interacts (browsers require a
// gesture before audio), and shot mode never creates a context at all.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Call from the first pointer/key gesture. Safe to call repeatedly.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // A short oscillator blip with an exponential decay envelope.
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Filtered noise burst (impacts, deaths, flares).
  noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  shoot() { this.blip(720 + Math.random() * 120, 0.08, 'square', 0.10, 240); }
  hit() { this.blip(190, 0.05, 'triangle', 0.12, 120); }
  enemyDie() { this.noise(0.18, 0.22, 1400); this.blip(320, 0.14, 'sawtooth', 0.08, 60); }
  split() { this.noise(0.12, 0.15, 2200); }
  hurt() { this.blip(140, 0.22, 'sawtooth', 0.22, 55); this.noise(0.15, 0.15, 700); }
  pickup() { this.blip(880, 0.09, 'sine', 0.14, 1320); }
  heal() { this.blip(523, 0.12, 'sine', 0.16, 784); this.blip(784, 0.16, 'sine', 0.12, 1046); }
  dash() { this.noise(0.12, 0.12, 3200); }
  flare() { this.noise(0.4, 0.3, 900); this.blip(98, 0.35, 'sine', 0.2, 45); }
  click() { this.blip(660, 0.05, 'sine', 0.12, 880); }
  waveHorn() { this.blip(196, 0.5, 'triangle', 0.18, 294); this.blip(294, 0.5, 'triangle', 0.12, 392); }
  bossRoar() { this.blip(70, 0.7, 'sawtooth', 0.25, 38); this.noise(0.6, 0.2, 500); }
  upgrade() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.14, 'sine', 0.14, f), i * 70)); }
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sine', 0.16, f), i * 110)); }
  gameOver() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.35, 'triangle', 0.16, f * 0.9), i * 160)); }

  // A slow, quiet two-note lantern drone that keeps the arena from feeling
  // dead. Runs on a timer, not the game loop, so pausing stops the steps.
  startMusic() {
    if (this.musicTimer) return;
    const notes = [110, 130.81, 98, 146.83];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = notes[this.musicStep % notes.length];
      this.musicStep += 1;
      this.blip(f, 2.4, 'sine', 0.045, f);
      this.blip(f * 2, 2.4, 'sine', 0.02, f * 2);
    }, 2400);
  }
}
