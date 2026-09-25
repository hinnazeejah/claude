import { Tool, type ToolContext, type Verdict } from './tool';
import type { Target } from './picking';
import * as I from './instruments';
import { logEvent, state } from '../core/state';
import { bus } from '../core/events';

/**
 * Imaging / monitoring tools: ICG videoangiography, micro-Doppler and the endoscope. They read
 * the flow model, so they show the true result of a clip.
 */
export class IcgTool extends Tool {
  readonly id = 'icg' as const;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.reticle();
  }
  judge(): Verdict { return 'valid'; }
  onDown(): void {
    const icg = this.ctx.services.icg;
    if (!icg) return;
    if (!icg.active) {
      state.checks.set('icg', state.time);
      logEvent('icg');
    }
    icg.toggle();
  }
}

/** Micro-Doppler: touch a vessel to hear its flow. */
export class DopplerTool extends Tool {
  readonly id = 'doppler' as const;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.doppler();
  }
  judge(t: Target): Verdict {
    return t.kind === 'vessel' || t.kind === 'aneurysm' ? 'valid' : 'invalid';
  }
  private reported = false;
  private key(t: Target) {
    return t.kind === 'aneurysm' ? 'aneurysm' : t.structure;
  }
  onDown(t: Target | null): void {
    this.reported = false;
    if (!t || this.judge(t) !== 'valid') return;
    const key = this.key(t);
    state.checks.set(`doppler:${key}`, state.time);
    logEvent('doppler', key);
  }
  onUp(): void {
    this.ctx.services.doppler?.(null);
  }
  deactivate(): void {
    this.ctx.services.doppler?.(null);
  }
  /** While the probe touches a vessel you hear its flow; silence means no flow. */
  update(): void {
    const t = this.target;
    if (!this.pressed || !t || this.judge(t) !== 'valid') { this.ctx.services.doppler?.(null); return; }
    const flow = state.flow[this.key(t)] ?? 1;
    this.ctx.services.doppler?.(flow);
    if (!this.reported) {
      this.reported = true;
      bus.emit('notice', { key: flow > 0.05 ? 'nDopplerFlow' : 'nDopplerNoFlow', level: flow > 0.05 ? 'info' : 'warn', arg: t.kind === 'aneurysm' ? 'a.dome' : `a.${t.structure}` });
    }
  }
}

/** Endoscope: look behind the ICA and aneurysm (PCom, AChA, back wall of the neck). */
export class EndoscopeTool extends Tool {
  readonly id = 'endoscope' as const;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.endoscope();
  }
  judge(): Verdict { return 'valid'; }
  onDown(): void {
    if (!this.ctx.services.endoscope?.active) logEvent('endoscope');
    this.ctx.services.endoscope?.toggle();
  }
}
