import { Tool, type ToolContext, type Verdict } from './tool';
import type { Target } from './picking';
import * as I from './instruments';

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
  onDown(): void { this.notice('nComingM5', 'info'); }
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
  onDown(): void { this.notice('nComingM5', 'info'); }
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
