/**
 * Synthesised sound effects via WebAudio (no audio files). The context is
 * created only on the first user gesture (autoplay policy). Every method is
 * a safe no-op before unlock or when WebAudio is unavailable.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private laserOsc: OscillatorNode | null = null;
  private laserOsc2: OscillatorNode | null = null;
  private laserGain: GainNode | null = null;
  private lastBreak = 0;
  private breaksThisWindow = 0;
  volume = 0.5;
  muted = false;

  /** Call from a user gesture handler. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.applyVolume();
    // 1 s of white noise reused for all noise-based effects.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.setupLaser();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyVolume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolume();
    return this.muted;
  }

  /** Pause/resume the audio context with the game (hidden tab, pause menu). */
  suspend(s: boolean): void {
    if (!this.ctx) return;
    if (s) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private applyVolume(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.6, this.ctx.currentTime, 0.02);
  }

  private setupLaser(): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 110;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 220.7;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(this.master!);
    o1.start();
    o2.start();
    this.laserOsc = o1;
    this.laserOsc2 = o2;
    this.laserGain = g;
  }

  /** Continuous laser hum; intensity 0 = off. Pitch rises with power. */
  laser(on: boolean, power: number, hitting: boolean): void {
    if (!this.ctx || !this.laserGain || !this.laserOsc || !this.laserOsc2) return;
    const t = this.ctx.currentTime;
    const target = on ? (hitting ? 0.16 : 0.09) : 0;
    this.laserGain.gain.setTargetAtTime(target, t, on ? 0.015 : 0.04);
    const f = 95 + Math.min(power, 8) * 14 + (hitting ? 8 : 0);
    this.laserOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.laserOsc2.frequency.setTargetAtTime(f * 2.007, t, 0.05);
  }

  /** Short crumble; rate-limited so mass destruction does not clip. */
  cellBreak(valuable: boolean): void {
    if (!this.ctx || !this.noise) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBreak > 0.05) {
      this.lastBreak = now;
      this.breaksThisWindow = 0;
    }
    if (++this.breaksThisWindow > 2) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = valuable ? 2400 + Math.random() * 1200 : 500 + Math.random() * 500;
    bp.Q.value = valuable ? 8 : 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(valuable ? 0.35 : 0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (valuable ? 0.18 : 0.08));
    src.connect(bp).connect(g).connect(this.master!);
    src.start(now, Math.random() * 0.8, 0.2);
  }

  pulse(): void {
    if (!this.ctx || !this.noise) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(38, now + 0.35);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.7, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    o.connect(og).connect(this.master!);
    o.start(now);
    o.stop(now + 0.5);
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, now);
    lp.frequency.exponentialRampToValueAtTime(200, now + 0.4);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.45, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    n.connect(lp).connect(ng).connect(this.master!);
    n.start(now, 0, 0.45);
  }

  /** Rising whoosh for the world warp. */
  warp(): void {
    if (!this.ctx || !this.noise) return;
    const now = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(200, now);
    bp.frequency.exponentialRampToValueAtTime(5000, now + 1.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 1.4);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
    n.connect(bp).connect(g).connect(this.master!);
    n.start(now);
    n.stop(now + 1.85);
  }

  /** Warm major chord for arriving in a new world. */
  arrive(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [261.6, 329.6, 392, 523.3].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = i === 3 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, now + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.16, now + 0.25 + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, now + 2.6);
      o.connect(g).connect(this.master!);
      o.start(now + i * 0.07);
      o.stop(now + 2.7);
    });
  }

  /** Deep boom + glass shimmer when the last core breaks. */
  finale(): void {
    this.pulse();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 880 * Math.pow(1.5, i % 4) * (1 + i * 0.01);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.14, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 1.2);
      o.connect(g).connect(this.master!);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 1.25);
    }
  }

  private lastChime = 0;

  /** Glassy chime for resonance; heavily rate-limited (chains hit many cells). */
  resonance(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastChime < 0.06) return;
    this.lastChime = now;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1200 + Math.random() * 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    o.connect(g).connect(this.master!);
    o.start(now);
    o.stop(now + 0.32);
  }

  private lastBlast = 0;

  blast(): void {
    if (!this.ctx || !this.noise) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBlast < 0.07) return;
    this.lastBlast = now;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, now);
    lp.frequency.exponentialRampToValueAtTime(150, now + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    n.connect(lp).connect(g).connect(this.master!);
    n.start(now, Math.random() * 0.5, 0.3);
  }

  purchase(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 783.99].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      const t = now + i * 0.07;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 0.3);
    });
  }

  denied(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 120;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o.connect(g).connect(this.master!);
    o.start(now);
    o.stop(now + 0.15);
  }
}
