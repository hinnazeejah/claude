import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { arterialPulse } from '../src/core/pulse';
import { ANATOMY } from '../src/config/anatomy';
import { aneurysmShape, buildAneurysm } from '../src/anatomy/aneurysm';
import { buildVessels, vesselLines } from '../src/anatomy/vessels';
import { buildTube } from '../src/anatomy/tube';

describe('arterial pulse waveform', () => {
  it('stays in 0..1 and peaks in early systole', () => {
    let peak = 0, peakAt = 0;
    for (let i = 0; i < 1000; i++) {
      const v = arterialPulse(i / 1000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > peak) { peak = v; peakAt = i / 1000; }
    }
    expect(peakAt).toBeGreaterThan(0.1);
    expect(peakAt).toBeLessThan(0.25);
  });
});

describe('tube builder', () => {
  it('faces outward (normals point away from the centreline)', () => {
    const tube = buildTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 20, 2)], { radius: [2, 1] });
    const g = tube.geometry;
    const idx = g.index!.array;
    const P = g.attributes.position;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    // triangle in the middle of the tube: its geometric normal must point away from the axis
    const t = Math.floor(idx.length / 6) * 3;
    a.fromBufferAttribute(P, idx[t]); b.fromBufferAttribute(P, idx[t + 1]); c.fromBufferAttribute(P, idx[t + 2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const closest = tube.curve.getPointAt(0.5);
    expect(n.dot(centroid.clone().sub(new THREE.Vector3(closest.x, centroid.y, closest.z)))).toBeGreaterThan(0);
  });
});

describe('aneurysm', () => {
  const s = aneurysmShape();
  it('has the configured 6.6 mm dome', () => {
    expect(s.domeRadius * 2).toBeCloseTo(ANATOMY.aneurysm.domeDiameter, 5);
  });
  it('projects posterolaterally and downward', () => {
    expect(s.dir.x).toBeLessThan(0); // lateral on the right side
    expect(s.dir.y).toBeLessThan(0); // inferior
    expect(s.dir.z).toBeLessThan(0); // posterior
  });
  it('meshes to roughly the right size', () => {
    const ica = ANATOMY.vessels.find(v => v.id === 'ica')!;
    const { mesh } = buildAneurysm(vesselLines(ica)[0], 2);
    const P = mesh.geometry.attributes.position;
    const idx = mesh.geometry.index!.array;
    let maxAlong = 0, maxSide = 0;
    const q = new THREE.Vector3();
    for (let i = 0; i < idx.length; i++) {
      q.fromBufferAttribute(P, idx[i]).sub(s.domeCenter);
      maxAlong = Math.max(maxAlong, q.dot(s.dir));
      maxSide = Math.max(maxSide, q.clone().projectOnPlane(s.dir).length());
    }
    expect(maxAlong).toBeGreaterThan(s.domeRadius * 0.9);
    expect(maxSide * 2).toBeGreaterThan(6.0);
    expect(maxSide * 2).toBeLessThan(7.6);
  });
});

describe('vessels', () => {
  it('builds every configured artery from model or config centrelines', () => {
    const vessels = buildVessels();
    for (const def of ANATOMY.vessels) {
      const v = vessels.get(def.id)!;
      expect(v, def.id).toBeDefined();
      expect(v.tubes.length, def.id).toBeGreaterThan(0);
      expect(v.tubes[0].length, def.id).toBeGreaterThan(3);
    }
  });
  it('keeps the supraclinoid ICA ending near the bifurcation (origin)', () => {
    const ica = vesselLines(ANATOMY.vessels.find(v => v.id === 'ica')!)[0];
    expect(ica[ica.length - 1].length()).toBeLessThan(2);
  });
  it('PCom and AChA start inside the ICA lumen', () => {
    const ica = vesselLines(ANATOMY.vessels.find(v => v.id === 'ica')!)[0];
    for (const id of ['pcom', 'acha'] as const) {
      const start = vesselLines(ANATOMY.vessels.find(v => v.id === id)!)[0][0];
      const d = Math.min(...ica.map(p => p.distanceTo(start)));
      expect(d, id).toBeLessThan(2.1);
    }
  });
});
