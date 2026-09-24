import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addRuptureRisk, state, sylvianCutFraction } from '../src/core/state';
import { bus } from '../src/core/events';
import { cutArachnoid, freeAdhesion, requestOpening, updateAllowedOpening } from '../src/tools/tissue';
import { SIM } from '../src/config/sim';
import { updateTweens } from '../src/core/tween';
import { aneurysmRegion } from '../src/tools/picking';
import { aneurysmShape } from '../src/anatomy/aneurysm';
import { clipModel, MATS } from '../src/tools/instruments';

function segment(patch: string) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4, 2, 2), new THREE.MeshBasicMaterial());
  return { mesh, patch, cut: false, work: 4 };
}

beforeEach(() => {
  state.arachnoid.total = { 'sylvian-superficial': 2, 'carotid-cistern': 1 };
  state.arachnoid.cut = {};
  state.ruptureRisk = 0;
  state.ruptured = false;
  state.ruptureThreshold = 1;
  updateAllowedOpening();
});

describe('arachnoid and retraction', () => {
  it('limits fissure opening until the sylvian arachnoid is cut', () => {
    expect(state.retraction.allowed).toBeCloseTo(SIM.retraction.baseAllowed);
    let got = -1;
    const off = bus.on('anatomy:opening', v => (got = v));
    expect(requestOpening(0.8)).toBe(false);
    expect(got).toBeCloseTo(SIM.retraction.baseAllowed);
    cutArachnoid(segment('sylvian-superficial'));
    cutArachnoid(segment('sylvian-superficial'));
    expect(sylvianCutFraction()).toBe(1);
    expect(requestOpening(0.8)).toBe(true);
    expect(got).toBeCloseTo(0.8);
    off();
  });
  it('cutting a segment twice counts once and hides it after the animation', () => {
    const s = segment('carotid-cistern');
    cutArachnoid(s);
    cutArachnoid(s);
    expect(state.arachnoid.cut['carotid-cistern']).toBe(1);
    updateTweens(1);
    expect(s.mesh.visible).toBe(false);
  });
});

describe('rupture risk', () => {
  it('ruptures once the hidden threshold is crossed, and only once', () => {
    let n = 0;
    const off = bus.on('rupture', () => n++);
    addRuptureRisk(0.6, 'test');
    expect(state.ruptured).toBe(false);
    addRuptureRisk(0.6, 'test');
    addRuptureRisk(0.6, 'test');
    expect(state.ruptured).toBe(true);
    expect(n).toBe(1);
    off();
  });
});

describe('adhesions', () => {
  it('reports remaining strands per group', () => {
    state.adhesions.total = { proximalNeck: 2, distalNeck: 1, dome: 0 };
    state.adhesions.freed = { proximalNeck: 0, distalNeck: 0, dome: 0 };
    const seen: number[] = [];
    const off = bus.on('adhesion:freed', e => seen.push(e.remaining));
    const mk = () => ({ mesh: new THREE.Mesh(), group: 'proximalNeck' as const, work: 1, freed: false });
    freeAdhesion(mk());
    freeAdhesion(mk());
    expect(seen).toEqual([1, 0]);
    off();
  });
});

describe('aneurysm regions', () => {
  const s = aneurysmShape();
  it('classifies neck, dome and bleb', () => {
    expect(aneurysmRegion(s.neckCenter.clone().addScaledVector(s.dir, 0.5), s)).toBe('neck');
    expect(aneurysmRegion(s.domeCenter.clone().addScaledVector(s.dir, s.domeRadius), s)).not.toBe('neck');
    expect(aneurysmRegion(s.blebCenter, s)).toBe('bleb');
  });
});

describe('clip model', () => {
  it('opens to the configured gap at the tips', () => {
    for (const kind of ['straight', 'curved'] as const) {
      const c = clipModel(kind, MATS.titanium);
      c.group.updateMatrixWorld(true);
      const zs: number[] = [];
      c.group.children.forEach(ch => {
        if (!ch.userData.side) return;
        const box = new THREE.Box3().setFromObject(ch);
        zs.push(ch.userData.side > 0 ? box.max.z : box.min.z);
      });
      expect(zs.length).toBe(2);
      expect(Math.abs(zs[0] - zs[1])).toBeGreaterThan(SIM.clip.openGap * 0.9);
    }
  });
});
