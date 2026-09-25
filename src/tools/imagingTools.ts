import { Tool, type ToolContext, type Verdict } from './tool';
import type { Target } from './picking';
import * as I from './instruments';
import { logEvent, state } from '../core/state';

/**
 * Imaging / monitoring tools. Their full behaviour (fluorescence view, Doppler flow sounds,
 * picture-in-picture endoscope) depends on the flow model and arrives in M5; in M2 they have
 * their instruments, hover rules and a notice.
 */
export class IcgTool extends Tool {
  readonly id = 'icg' as const;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.reticle();
  }
  judge(): Verdict { return 'valid'; }
  onDown(): void {
    // M3: the run is recorded for the checklist; the fluorescence view arrives in M5
    state.checks.set('icg', state.time);
    logEvent('icg');
    this.notice('nIcgStub', 'info');
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
  onDown(t: Target | null): void {
    if (!t || this.judge(t) !== 'valid') return;
    // M3: the check is recorded for the checklist; flow sounds arrive in M5
    const key = t.kind === 'aneurysm' ? 'aneurysm' : t.structure;
    state.checks.set(`doppler:${key}`, state.time);
    logEvent('doppler', key);
    this.notice('nDopplerStub', 'info');
  }
}

/** Endoscope: look behind the ICA and aneurysm (PCom, AChA, back wall of the neck). */
export class EndoscopeTool extends Tool {
  readonly id = 'endoscope' as const;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.endoscope();
  }
  judge(t: Target): Verdict { return t.kind === 'aneurysm' || t.kind === 'vessel' || t.kind === 'nerve' ? 'valid' : 'invalid'; }
  onDown(): void { this.notice('nComingM5', 'info'); }
}
