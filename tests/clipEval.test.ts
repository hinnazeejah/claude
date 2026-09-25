import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { evaluateClips, idealClipPose, NO_CLIP } from '../src/physics/clipEval';
import { buildEvalGeometry } from '../src/physics/geometry';
import { computeFlow } from '../src/physics/flow';
import { ANATOMY } from '../src/config/anatomy';
import type { PlacedClip } from '../src/core/state';

const g = buildEvalGeometry();
const F = new THREE.Vector3(...ANATOMY.microscope.eyeDir).normalize().negate();
const clip = (pose: ReturnType<typeof idealClipPose>): PlacedClip => ({ id: 1, variant: 'straight', object: new THREE.Group(), ...pose });
const shifted = (d: number) => {
  const p = idealClipPose(g, F);
  const off = g.shape.dir.clone().multiplyScalar(d);
  return clip({ ...p, head: p.head.clone().add(off), tips: p.tips.clone().add(off) });
};

describe('clip evaluation', () => {
  it('no clip → sac fills', () => {
    expect(evaluateClips([], g)).toEqual(NO_CLIP);
  });
  it('the ideal clip seals the neck and spares the ICA, PCom and AChA', () => {
    const r = evaluateClips([clip(idealClipPose(g, F))], g);
    expect(r.neckClosure).toBeGreaterThanOrEqual(0.95);
    expect(r.sacFilling).toBe(0);
    expect(r.residualNeckMm).toBeLessThan(1);
    expect(r.icaStenosis).toBeLessThan(0.3);
    expect(r.pcomPatent).toBe(true);
    expect(r.achaPatent).toBe(true);
  });
  it('a clip out on the dome leaves a residual neck', () => {
    const r = evaluateClips([shifted(3)], g);
    expect(r.residualNeckMm).toBeGreaterThan(2);
  });
  it('a clip pushed into the parent artery narrows the ICA', () => {
    const r = evaluateClips([shifted(-1.9)], g);
    expect(r.icaStenosis).toBeGreaterThan(0.3);
  });
  it('a short, crooked clip only partly closes the neck', () => {
    const p = idealClipPose(g, F);
    const rot = new THREE.Quaternion().setFromAxisAngle(p.widthAxis, Math.PI / 2);
    const blade = p.bladeAxis.clone().applyQuaternion(rot), close = p.closeAxis.clone().applyQuaternion(rot);
    const C = p.head.clone().lerp(p.tips, 0.5);
    const head = C.clone().addScaledVector(blade, -1); // only 1 mm of blade reaches past the centre
    const r = evaluateClips([clip({ ...p, bladeAxis: blade, closeAxis: close, head, tips: head.clone().addScaledVector(blade, 7) })], g);
    expect(r.neckClosure).toBeLessThan(0.95);
    expect(r.sacFilling).toBeGreaterThan(0);
  });
});

describe('flow model', () => {
  it('temporary clip drops distal ICA flow to the collateral level; PCom keeps flowing', () => {
    const f = computeFlow({ tempClip: true, clip: NO_CLIP, occluded: new Set() });
    expect(f.ica).toBeLessThan(0.3);
    expect(f.pcom).toBeGreaterThan(0.3);
  });
  it('a trapped branch is silent', () => {
    const f = computeFlow({ tempClip: false, clip: { ...NO_CLIP, pcomPatent: false }, occluded: new Set(['acha']) });
    expect(f.pcom).toBe(0);
    expect(f.acha).toBe(0);
    expect(f.m1).toBe(1);
  });
});
