import { SIM } from '../config/sim';

/**
 * VITALS MODEL — illustrative physiology, not validated.
 *  - Blood loss lowers arterial pressure (hypovolaemia) and raises heart rate (baroreflex).
 *  - Temporary occlusion beyond a few minutes, or losing the anterior choroidal artery, lowers
 *    motor evoked potentials (MEP); hypotension makes ischaemia worse, faster.
 *  - Everything drifts slightly so the monitor looks alive.
 */
export interface VitalsInput {
  /** Current bleeding into the field (ml/s). */
  bleedRate: number;
  tempClipSeconds: number;
  /** Relative flow in the anterior choroidal artery and distal ICA (0..1). */
  achaFlow: number;
  icaFlow: number;
}

export class Vitals {
  hr = 72;
  sys = 122;
  dia = 72;
  spo2 = 99;
  mep = 100;
  ebl = 0;
  /** Seconds of accumulated ischaemic "debt" driving MEP. */
  private ischaemia = 0;
  private n = [0, 0, 0, 0];
  private t = 0;

  get map(): number {
    return this.dia + (this.sys - this.dia) / 3;
  }

  update(dt: number, i: VitalsInput): void {
    const V = SIM.vitals;
    this.t += dt;
    this.ebl += i.bleedRate * dt;
    // slow random walks
    this.n = this.n.map((v, k) => v + (Math.random() - 0.5) * dt * 1.2 - v * dt * (0.15 + k * 0.05));
    const loss = this.ebl < V.compensatedMl ? this.ebl * 0.012 : V.compensatedMl * 0.012 + (this.ebl - V.compensatedMl) * 0.045;
    const acute = Math.min(25, i.bleedRate * 3.5);
    const mapTarget = Math.max(38, V.baseMap - loss - acute + this.n[0] * 3);
    const map = this.map + (mapTarget - this.map) * Math.min(1, dt / 4);
    const pulse = Math.max(18, 50 - loss * 0.35 + this.n[1] * 2);
    this.dia = map - pulse / 3;
    this.sys = this.dia + pulse;
    const hrTarget = Math.min(155, Math.max(50, V.baseHr + Math.max(0, V.baseMap - map) * 1.1 + this.n[2] * 2.5));
    this.hr += (hrTarget - this.hr) * Math.min(1, dt / 3);
    const spTarget = map < 55 ? 99 - (55 - map) * 0.6 : 99 - Math.abs(this.n[3]) * 0.8;
    this.spo2 += (spTarget - this.spo2) * Math.min(1, dt / 6);

    // ischaemia → MEP
    const hypo = map < V.mepHypotension ? 1.8 : 1;
    let insult = 0;
    if (i.tempClipSeconds > V.safeOcclusionS) insult += hypo;
    if (i.achaFlow < 0.2) insult += 3;
    if (i.icaFlow < 0.5 && i.tempClipSeconds === 0) insult += (0.5 - i.icaFlow) * 2 * hypo;
    this.ischaemia = insult > 0 ? this.ischaemia + insult * dt : Math.max(0, this.ischaemia - dt * 0.6);
    const mepTarget = Math.max(5, 100 - this.ischaemia * V.mepLossPerS + this.n[3] * 2);
    this.mep += (mepTarget - this.mep) * Math.min(1, dt / 5);
  }

  alarms(): { key: string; level: 'warn' | 'alarm' }[] {
    const a: { key: string; level: 'warn' | 'alarm' }[] = [];
    if (this.sys < 80) a.push({ key: 'alarmHypotension', level: 'alarm' });
    else if (this.sys < 95) a.push({ key: 'alarmLowBp', level: 'warn' });
    if (this.hr > 125) a.push({ key: 'alarmTachy', level: 'warn' });
    if (this.mep < 50) a.push({ key: 'alarmMep', level: 'alarm' });
    else if (this.mep < 75) a.push({ key: 'alarmMepDrop', level: 'warn' });
    if (this.spo2 < 92) a.push({ key: 'alarmSpo2', level: 'alarm' });
    return a;
  }
}
