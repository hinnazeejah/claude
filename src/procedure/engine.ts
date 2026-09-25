import { bus } from '../core/events';
import { logEvent, state } from '../core/state';
import { SIM } from '../config/sim';
import { STAGES } from './stages';

/**
 * Drives the checklist: identification by dwelling on a structure, sticky sub-task ticks, stage
 * completion / unlock, overall progress. Stateless apart from `state` and its own tick sets.
 */
export class ProcedureEngine {
  /** Ticked sub-tasks per stage (sticky). */
  readonly ticked: Set<string>[] = STAGES.map(() => new Set());
  private hover: string | null = null;
  private dwell = 0;

  constructor() {
    bus.on('look:structure', k => {
      this.hover = k;
      this.dwell = 0;
    });
  }

  get index(): number {
    return state.stage;
  }

  /** Fraction of required sub-tasks done across the whole procedure (0..1). */
  get progress(): number {
    let done = 0, total = 0;
    STAGES.forEach((s, i) => s.tasks.forEach(t => {
      if (t.optional) return;
      total++;
      if (this.ticked[i].has(t.id)) done++;
    }));
    return total ? done / total : 1;
  }

  /** Fraction of the current stage's required sub-tasks done. */
  stageProgress(i = state.stage): number {
    const req = STAGES[i]?.tasks.filter(t => !t.optional) ?? [];
    return req.length ? req.filter(t => this.ticked[i].has(t.id)).length / req.length : 1;
  }

  update(dt: number): void {
    // identification: rest the cursor on a structure for a moment
    if (this.hover && !state.identified.has(this.hover)) {
      this.dwell += dt;
      if (this.dwell >= SIM.stages.identifyDwell) {
        state.identified.add(this.hover);
        logEvent('identified', this.hover);
        bus.emit('identified', this.hover);
      }
    }
    if (state.complete) return;
    const i = state.stage;
    const stage = STAGES[i];
    let changed = false;
    for (const t of stage.tasks) {
      if (!this.ticked[i].has(t.id) && t.done()) {
        this.ticked[i].add(t.id);
        changed = true;
      }
    }
    if (changed) bus.emit('stage:progress', { index: i });
    if (stage.tasks.every(t => t.optional || this.ticked[i].has(t.id))) {
      logEvent('stage-complete', stage.id);
      if (i + 1 < STAGES.length) {
        state.stage = i + 1;
        bus.emit('stage:changed', { index: state.stage });
        bus.emit('notice', { key: `stage.${stage.id}.done`, level: 'info' });
      } else {
        state.complete = true;
        bus.emit('procedure:complete', {});
        bus.emit('notice', { key: 'procedureComplete', level: 'info' });
      }
    }
  }
}
