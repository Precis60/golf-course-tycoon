import type { Settings } from '../sim/types';

type Osc = OscillatorType;

/**
 * Original WebAudio score and effects. No sample files.
 * A quiet pentatonic pad loops under the course; shots and UI are short voices.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private timer = 0;
  private step = 0;
  private started = false;
  settings: Settings | null = null;

  attach(settings: Settings) {
    this.settings = settings;
    this.applyVolumes();
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    music.connect(filter);
    filter.connect(master);
    sfx.connect(master);
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.musicGain = music;
    this.sfxGain = sfx;
    this.applyVolumes();
    return ctx;
  }

  async unlock() {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!this.started) {
      this.started = true;
      this.loop();
    }
  }

  applyVolumes() {
    if (!this.master || !this.musicGain || !this.sfxGain || !this.settings) return;
    const m = this.settings.master;
    this.master.gain.value = m;
    this.musicGain.gain.value = this.settings.music * 0.22;
    this.sfxGain.gain.value = this.settings.sfx;
  }

  private tone(freq: number, dur: number, type: Osc, vol: number, when = 0, slideTo?: number) {
    if (!this.settings || this.settings.sfx <= 0 || this.settings.master <= 0) return;
    const ctx = this.ensure();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq = 800) {
    if (!this.settings || this.settings.sfx <= 0) return;
    const ctx = this.ensure();
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain!);
    src.start();
  }

  click() {
    this.tone(620, 0.05, 'triangle', 0.05);
  }
  paint() {
    this.tone(390, 0.04, 'triangle', 0.035);
  }
  cash() {
    this.tone(880, 0.09, 'sine', 0.05);
    this.tone(1320, 0.12, 'sine', 0.04, 0.06);
  }
  deny() {
    this.tone(180, 0.16, 'sawtooth', 0.04, 0, 90);
  }
  thwack() {
    this.noise(0.08, 0.18, 240);
    this.tone(140, 0.12, 'sine', 0.08, 0, 70);
  }
  putt() {
    this.tone(420, 0.06, 'triangle', 0.05, 0, 220);
  }
  splash() {
    this.noise(0.28, 0.12, 500);
    this.tone(320, 0.22, 'sine', 0.05, 0, 120);
  }
  cheer() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.05, i * 0.08));
  }
  hole() {
    this.cheer();
    this.tone(1568, 0.2, 'sine', 0.03, 0.32);
  }

  private chord(freqs: number[], t: number) {
    if (!this.ctx || !this.musicGain || !this.settings || this.settings.music <= 0) return;
    for (const f of freqs) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + 2.6);
    }
  }

  private loop = () => {
    if (!this.ctx) return;
    const chords = [
      [146.83, 220, 293.66],
      [196, 246.94, 392],
      [220, 261.63, 329.63],
      [174.61, 220, 293.66],
    ];
    const now = this.ctx.currentTime;
    if (this.timer < now + 0.1) {
      this.chord(chords[this.step % chords.length], now + 0.05);
      this.step++;
      this.timer = now + 2.4;
    }
    window.setTimeout(this.loop, 400);
  };
}

export function haptic(ms: number | number[], enabled: boolean) {
  if (!enabled) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* some browsers throw if vibration is blocked */
  }
}
