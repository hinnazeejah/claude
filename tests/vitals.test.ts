import { describe, expect, it } from 'vitest';
import { Vitals } from '../src/physics/vitals';
import { state } from '../src/core/state';
import { debriefTips, clipVerdict } from '../src/ui/debrief';
import { NO_CLIP } from '../src/physics/clipEval';

const run = (v: Vitals, s: number, i: Partial<Parameters<Vitals['update']>[1]>) => {
  for (let k = 0; k < s * 10; k++) v.update(0.1, { bleedRate: 0, tempClipSeconds: 0, achaFlow: 1, icaFlow: 1, ...i });
};

describe('vitals', () => {
  it('stays near baseline at rest', () => {
    const v = new Vitals();
    run(v, 60, {});
    expect(v.map).toBeGreaterThan(78);
    expect(v.hr).toBeLessThan(85);
    expect(v.mep).toBeGreaterThan(90);
  });
  it('bleeding drops blood pressure and raises heart rate', () => {
    const v = new Vitals();
    run(v, 150, { bleedRate: 4 });
    expect(v.ebl).toBeGreaterThan(500);
    expect(v.sys).toBeLessThan(95);
    expect(v.hr).toBeGreaterThan(95);
  });
  it('long temporary occlusion lowers MEP; a short one does not', () => {
    const short = new Vitals();
    for (let s = 0; s < 180; s++) run(short, 1, { tempClipSeconds: s });
    expect(short.mep).toBeGreaterThan(90);
    const long = new Vitals();
    for (let s = 0; s < 720; s++) run(long, 1, { tempClipSeconds: s });
    expect(long.mep).toBeLessThan(60);
  });
  it('losing the anterior choroidal artery drops MEP', () => {
    const v = new Vitals();
    run(v, 120, { achaFlow: 0 });
    expect(v.mep).toBeLessThan(50);
  });
});

describe('debrief', () => {
  it('flags a trapped PCom and a missing verification', () => {
    state.clipResult = { ...NO_CLIP, neckClosure: 1, sacFilling: 0, offTarget: false, pcomPatent: false };
    state.checks.clear();
    state.lastClipChange = 10;
    const tips = debriefTips();
    expect(tips.some(t => t.includes('PCom'))).toBe(true);
    expect(tips.some(t => t.includes('Doppler'))).toBe(true);
    expect(clipVerdict()).toBe('partial');
  });
  it('praises a clean case', () => {
    Object.assign(state, { ruptured: false, ruptureRisk: 0 });
    state.clipResult = { ...NO_CLIP, neckClosure: 1, sacFilling: 0, offTarget: false };
    state.checks.set('doppler:pcom', 20); state.checks.set('doppler:acha', 21); state.checks.set('icg', 22);
    state.injuries.length = 0; state.occluded.clear();
    state.retraction.excessiveSeconds = 0;
    state.tempClip.totalSeconds = 60;
    expect(clipVerdict()).toBe('good');
    expect(debriefTips()).toHaveLength(1);
  });
});
