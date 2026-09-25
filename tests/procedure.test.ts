import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { state } from '../src/core/state';
import { bus } from '../src/core/events';
import { ProcedureEngine } from '../src/procedure/engine';
import { STAGES } from '../src/procedure/stages';

const identify = (engine: ProcedureEngine, key: string) => {
  bus.emit('look:structure', key);
  engine.update(0.5);
  engine.update(0.5);
};

describe('procedure engine', () => {
  it('walks through all six stages in order', () => {
    Object.assign(state, { stage: 0, complete: false, lastClipChange: -1 });
    state.arachnoid.total = { 'sylvian-superficial': 4, 'sylvian-deep': 4, 'carotid-cistern': 4, 'neck-arachnoid': 4 };
    state.arachnoid.cut = {};
    state.adhesions.total = { proximalNeck: 2, distalNeck: 2, dome: 3 };
    state.adhesions.freed = { proximalNeck: 0, distalNeck: 0, dome: 0 };
    state.identified.clear();
    state.checks.clear();
    state.clips.length = 0;
    state.retraction.opening = 0;
    const engine = new ProcedureEngine();
    const changes: number[] = [];
    bus.on('stage:changed', e => changes.push(e.index));

    // 1: fissure — identifying things early must not skip stage 1
    identify(engine, 'm1');
    expect(state.stage).toBe(0);
    state.arachnoid.cut = { 'sylvian-superficial': 3, 'sylvian-deep': 3 };
    engine.update(0.016);
    expect(state.stage).toBe(0); // fissure not opened yet
    state.retraction.opening = 0.65;
    engine.update(0.016);
    expect(state.stage).toBe(1);

    // 2: M1 (M2 optional); M1 was identified earlier
    identify(engine, 'a1');
    expect(state.stage).toBe(2);

    // 3: ICA + optic nerve
    state.arachnoid.cut['carotid-cistern'] = 3;
    identify(engine, 'ica');
    identify(engine, 'opticNerve');
    expect(state.stage).toBe(3);

    // 4: neck
    state.arachnoid.cut['neck-arachnoid'] = 3;
    identify(engine, 'pcom');
    identify(engine, 'acha');
    state.adhesions.freed = { proximalNeck: 2, distalNeck: 1, dome: 0 };
    engine.update(0.016);
    expect(state.stage).toBe(3);
    state.adhesions.freed.distalNeck = 2;
    engine.update(0.016);
    expect(state.stage).toBe(4);

    // 5: clip, temporary clip must be off
    state.tempClip.applied = true;
    state.clips.push({ id: 1, variant: 'straight', head: new THREE.Vector3(), tips: new THREE.Vector3(), bladeAxis: new THREE.Vector3(), closeAxis: new THREE.Vector3(), widthAxis: new THREE.Vector3(), object: new THREE.Group() });
    state.lastClipChange = 10;
    engine.update(0.016);
    expect(state.stage).toBe(4);
    state.tempClip.applied = false;
    engine.update(0.016);
    expect(state.stage).toBe(5);

    // 6: checks before the clip do not count
    state.checks.set('doppler:pcom', 5);
    state.checks.set('doppler:acha', 11);
    state.checks.set('icg', 12);
    engine.update(0.016);
    expect(state.complete).toBe(false);
    state.checks.set('doppler:pcom', 13);
    engine.update(0.016);
    expect(state.complete).toBe(true);
    expect(engine.progress).toBe(1);
    expect(changes).toEqual([1, 2, 3, 4, 5]);
    expect(STAGES).toHaveLength(6);
  });
});
