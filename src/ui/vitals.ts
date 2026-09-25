import { bus } from '../core/events';
import { state } from '../core/state';
import { arterialPulse } from '../core/pulse';
import type { Vitals } from '../physics/vitals';
import { applyI18n } from './i18n';

/** Lead II ECG shape over one beat (phase 0..1): P, QRS, T. */
export function ecg(phase: number): number {
  const p = phase - Math.floor(phase);
  const g = (c: number, w: number, a: number) => a * Math.exp(-(((p - c) / w) ** 2));
  return g(0.1, 0.025, 0.12) - g(0.185, 0.008, 0.12) + g(0.2, 0.01, 1) - g(0.215, 0.01, 0.25) + g(0.43, 0.05, 0.28);
}

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

/**
 * Top-right monitor like an OR display: sweeping ECG and arterial traces, HR, ABP, SpO2,
 * operating time, temporary occlusion timer, estimated blood loss and MEP.
 */
export class VitalsPanel {
  private el: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private cv: HTMLCanvasElement;
  private x = 0;
  private lastY = [0, 0];
  private f: Record<string, HTMLElement> = {};
  private acc = 0;

  constructor(host: HTMLElement, private v: Vitals) {
    this.el = document.createElement('div');
    this.el.className = 'vitals panel';
    this.el.innerHTML = `
      <canvas width="560" height="150"></canvas>
      <div class="vgrid mono">
        <div class="vc hr"><span class="vl">HR</span><b data-f="hr"></b></div>
        <div class="vc abp"><span class="vl">ABP</span><b data-f="abp"></b><small data-f="map"></small></div>
        <div class="vc spo2"><span class="vl">SpO₂</span><b data-f="spo2"></b></div>
        <div class="vc mep"><span class="vl">MEP</span><b data-f="mep"></b></div>
        <div class="vc"><span class="vl" data-i18n="vOpTime"></span><b data-f="op"></b></div>
        <div class="vc occ"><span class="vl" data-i18n="vOcclusion"></span><b data-f="occ"></b></div>
        <div class="vc ebl"><span class="vl" data-i18n="vEbl"></span><b data-f="ebl"></b></div>
        <div class="vc"><span class="vl" data-i18n="vBleed"></span><b data-f="rate"></b></div>
      </div>`;
    host.appendChild(this.el);
    applyI18n(this.el);
    this.cv = this.el.querySelector('canvas')!;
    this.ctx = this.cv.getContext('2d')!;
    this.el.querySelectorAll<HTMLElement>('[data-f]').forEach(e => (this.f[e.dataset.f!] = e));
    this.ctx.fillStyle = '#000';
    bus.on('lang', () => applyI18n(this.el));
  }

  update(dt: number, heartPhase: number, opTime: number): void {
    // traces: 25 mm/s sweep with an erase bar
    const W = this.cv.width, H = this.cv.height, c = this.ctx;
    const speed = 110; // px/s
    const steps = Math.max(1, Math.ceil(dt * speed));
    for (let s = 0; s < steps; s++) {
      const ph = heartPhase - (dt * (steps - 1 - s)) / steps * (this.v.hr / 60);
      const x = this.x;
      c.fillStyle = 'rgba(0,0,0,1)';
      c.fillRect(x, 0, 8, H);
      const yE = 44 - ecg(ph) * 34;
      const art = this.v.dia + (this.v.sys - this.v.dia) * arterialPulse(ph - 0.08);
      const yA = 140 - (art - 40) * 0.55;
      c.lineWidth = 2;
      if (x > 0) {
        c.strokeStyle = '#5fe0a0';
        c.beginPath(); c.moveTo(x - 1, this.lastY[0]); c.lineTo(x, yE); c.stroke();
        c.strokeStyle = '#ff6a5c';
        c.beginPath(); c.moveTo(x - 1, this.lastY[1]); c.lineTo(x, yA); c.stroke();
      }
      this.lastY = [yE, yA];
      this.x = (x + 1) % W;
    }
    // numbers at ~4 Hz, like a monitor
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const v = this.v;
    const set = (k: string, text: string, cls?: string) => {
      this.f[k].textContent = text;
      this.f[k].parentElement!.classList.toggle('warn', cls === 'warn');
      this.f[k].parentElement!.classList.toggle('alarm', cls === 'alarm');
    };
    set('hr', Math.round(v.hr).toString(), v.hr > 125 ? 'warn' : undefined);
    set('abp', `${Math.round(v.sys)}/${Math.round(v.dia)}`, v.sys < 80 ? 'alarm' : v.sys < 95 ? 'warn' : undefined);
    this.f.map.textContent = `(${Math.round(v.map)})`;
    set('spo2', Math.round(v.spo2).toString(), v.spo2 < 92 ? 'alarm' : undefined);
    set('mep', `${Math.round(v.mep)}%`, v.mep < 50 ? 'alarm' : v.mep < 75 ? 'warn' : undefined);
    set('op', fmtTime(opTime));
    const occ = state.tempClip.applied ? state.time - state.tempClip.since : 0;
    set('occ', state.tempClip.applied ? fmtTime(occ) : `— ${fmtTime(state.tempClip.totalSeconds)}`, occ > 480 ? 'alarm' : occ > 300 ? 'warn' : undefined);
    this.f.occ.parentElement!.classList.toggle('on', state.tempClip.applied);
    set('ebl', `${Math.round(v.ebl)} ml`, v.ebl > 500 ? 'alarm' : v.ebl > 250 ? 'warn' : undefined);
    set('rate', `${state.vitals.bleedRate.toFixed(1)} ml/s`, state.vitals.bleedRate > 1 ? 'alarm' : state.vitals.bleedRate > 0.05 ? 'warn' : undefined);
  }
}
