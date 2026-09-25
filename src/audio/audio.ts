import { arterialPulse } from '../core/pulse';

/**
 * All sound is synthesised with the Web Audio API (no files):
 *  - pulse-oximeter beep on every heartbeat, pitch falling with SpO2 like a real monitor
 *  - alarm tones (medium: two-tone chime, high: fast triple beep)
 *  - micro-Doppler: band-passed noise swept by the arterial waveform ("whoosh-whoosh"),
 *    loudness ∝ flow; silent when the vessel is occluded
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private doppler: { gain: GainNode; filter: BiquadFilterNode; hum: GainNode } | null = null;
  private dopplerFlow: number | null = null;
  muted = false;
  private nextAlarm = 0;

  /** Must be called from a user gesture (the Start button). */
  start(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.buildDoppler();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', when = 0): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /** Pulse-oximeter beep (call once per heartbeat). */
  beat(spo2: number): void {
    const f = 380 + Math.max(0, spo2 - 80) * 22;
    this.tone(f, 0.09, 0.12, 'triangle');
  }

  /** Alarm pattern; call every frame with the highest active level. */
  alarm(level: 'warn' | 'alarm' | null, now: number): void {
    if (!level || now < this.nextAlarm) return;
    if (level === 'alarm') {
      [0, 0.16, 0.32].forEach(w => this.tone(960, 0.12, 0.16, 'square', w));
      [0.9, 1.06].forEach(w => this.tone(960, 0.12, 0.16, 'square', w));
      this.nextAlarm = now + 3.2;
    } else {
      this.tone(620, 0.25, 0.12, 'sine');
      this.tone(520, 0.3, 0.12, 'sine', 0.28);
      this.nextAlarm = now + 6;
    }
  }

  /** One-off cue (identification, stage complete). */
  chime(): void {
    this.tone(880, 0.18, 0.08, 'sine');
    this.tone(1320, 0.25, 0.06, 'sine', 0.09);
  }

  private buildDoppler(): void {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.2;
    filter.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // faint electronic hum of the probe when touching tissue
    const hum = ctx.createGain();
    hum.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.frequency.value = 120;
    osc.connect(hum).connect(this.master);
    osc.start();
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.doppler = { gain, filter, hum };
  }

  /** Probe on a vessel with relative flow 0..1, or null when lifted. */
  setDoppler(flow: number | null): void {
    this.dopplerFlow = flow;
  }

  /** Per-frame update: sweeps the Doppler with the cardiac cycle. */
  update(heartPhase: number): void {
    if (!this.ctx || !this.doppler) return;
    const t = this.ctx.currentTime;
    const f = this.dopplerFlow;
    const p = arterialPulse(heartPhase);
    if (f === null || f < 0.04) {
      this.doppler.gain.gain.setTargetAtTime(0, t, 0.03);
      this.doppler.hum.gain.setTargetAtTime(f === null ? 0 : 0.01, t, 0.05);
      return;
    }
    // velocity ↑ in systole → higher pitch and louder
    this.doppler.filter.frequency.setTargetAtTime(260 + 1300 * p * Math.sqrt(f), t, 0.015);
    this.doppler.gain.gain.setTargetAtTime((0.08 + 0.55 * p) * Math.min(1, f * 1.2), t, 0.015);
    this.doppler.hum.gain.setTargetAtTime(0.004, t, 0.05);
  }
}

export const audio = new AudioEngine();
