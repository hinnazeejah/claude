import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ANATOMY } from '../config/anatomy';
import { enhance, wetMaterial } from './shaders';

const v3 = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

/** Geometric description of the sac, reused by tools and clip evaluation. */
export interface AneurysmShape {
  neckCenter: THREE.Vector3;
  /** Unit projection direction of the dome. */
  dir: THREE.Vector3;
  domeCenter: THREE.Vector3;
  domeRadius: number;
  neckRadius: number;
  blebCenter: THREE.Vector3;
  blebRadius: number;
}

export function aneurysmShape(): AneurysmShape {
  const a = ANATOMY.aneurysm;
  const dir = v3(a.direction).normalize();
  const neckCenter = v3(a.neckCenter);
  const domeRadius = a.domeDiameter / 2;
  const domeCenter = neckCenter.clone().addScaledVector(dir, a.neckLength + domeRadius);
  const bd = v3(a.bleb.direction).normalize();
  const blebRadius = a.bleb.diameter / 2;
  const blebCenter = domeCenter.clone().addScaledVector(bd, domeRadius + a.bleb.height - blebRadius);
  return { neckCenter, dir, domeCenter, domeRadius, neckRadius: a.neckDiameter / 2, blebCenter, blebRadius };
}

// ---- signed distance helpers (negative inside) ----
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};

/** Inigo Quilez' round cone: sphere r1 at a smoothly hulled to sphere r2 at b. */
function sdRoundCone(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number) {
  const ba = b.clone().sub(a), pa = p.clone().sub(a);
  const l2 = ba.dot(ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const y = pa.dot(ba), z = y - l2;
  const xv = pa.clone().multiplyScalar(l2).addScaledVector(ba, -y);
  const x2 = xv.dot(xv), y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

function distToPolyline(p: THREE.Vector3, pts: THREE.Vector3[]) {
  let best = Infinity;
  const ab = new THREE.Vector3(), ap = new THREE.Vector3();
  for (let i = 1; i < pts.length; i++) {
    ab.subVectors(pts[i], pts[i - 1]); ap.subVectors(p, pts[i - 1]);
    const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
    best = Math.min(best, ap.addScaledVector(ab, -t).length());
  }
  return best;
}

/**
 * Builds the sac as an implicit surface: dome sphere + round-cone neck + bleb, smoothly blended
 * into the ICA wall so the neck flares naturally. Meshed with marching cubes.
 * `icaCenterline` / `icaRadius` describe the parent artery near the neck.
 */
export function buildAneurysm(icaCenterline: THREE.Vector3[], icaRadius: number) {
  const s = aneurysmShape();
  const neckBase = s.neckCenter.clone().addScaledVector(s.dir, -0.9);
  const sdf = (p: THREE.Vector3) => {
    const sac = sdRoundCone(p, neckBase, s.domeCenter, s.neckRadius, s.domeRadius);
    const bleb = p.distanceTo(s.blebCenter) - s.blebRadius;
    const ica = distToPolyline(p, icaCenterline) - icaRadius * 0.95;
    return smin(smin(sac, bleb, 0.45), ica, 0.9);
  };

  const half = s.domeRadius + 3.2;
  const res = 76;
  const center = s.domeCenter.clone().addScaledVector(s.dir, -1.6);
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 120000);
  mc.isolation = 0;
  const p = new THREE.Vector3();
  const h = res / 2;
  for (let z = 0; z < res; z++) for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    p.set(center.x + ((x - h) / h) * half, center.y + ((y - h) / h) * half, center.z + ((z - h) / h) * half);
    mc.field[z * res * res + y * res + x] = -sdf(p);
  }
  mc.update();

  const count = mc.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    pos[3 * i] = center.x + mc.positionArray[3 * i] * half;
    pos[3 * i + 1] = center.y + mc.positionArray[3 * i + 1] * half;
    pos[3 * i + 2] = center.z + mc.positionArray[3 * i + 2] * half;
    n.fromArray(mc.normalArray, 3 * i).normalize();
    nor.set([n.x, n.y, n.z], 3 * i);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g = mergeVertices(g, 1e-4);
  mc.geometry.dispose();

  // Drop the part of the implicit surface that is just the ICA wall (hidden inside the ICA tube)
  // so it does not z-fight; keep the flare near the neck.
  const P = g.attributes.position as THREE.BufferAttribute;
  const idx = g.index!.array;
  const keep: number[] = [];
  const q = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    q.set(0, 0, 0);
    for (let k = 0; k < 3; k++) q.add(new THREE.Vector3().fromBufferAttribute(P, idx[t + k]));
    q.multiplyScalar(1 / 3);
    if (distToPolyline(q, icaCenterline) > icaRadius * 1.0) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  g.setIndex(keep);

  // Per-vertex attributes: pulsation weight (dome pulses, neck is tethered) and wall thinness.
  const pulse = new Float32Array(P.count), delay = new Float32Array(P.count), thin = new Float32Array(P.count);
  const apex = s.domeCenter.clone().addScaledVector(s.dir, s.domeRadius);
  for (let i = 0; i < P.count; i++) {
    q.fromBufferAttribute(P, i);
    const along = q.clone().sub(s.neckCenter).dot(s.dir);
    const w = THREE.MathUtils.smoothstep(along, 0.2, 2.5);
    pulse[i] = ANATOMY.aneurysm.pulse * s.domeRadius * w;
    delay[i] = 0.03;
    const blebT = 1 - THREE.MathUtils.smoothstep(q.distanceTo(s.blebCenter), s.blebRadius * 0.8, s.blebRadius * 2.2);
    const apexT = 1 - THREE.MathUtils.smoothstep(q.distanceTo(apex), 0, s.domeRadius * 1.3);
    thin[i] = Math.min(1, blebT + 0.35 * apexT);
  }
  g.setAttribute('aPulse', new THREE.BufferAttribute(pulse, 1));
  g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
  g.setAttribute('aThin', new THREE.BufferAttribute(thin, 1));
  g.computeBoundingSphere();

  const mat = enhance(
    wetMaterial(ANATOMY.colors.aneurysm, { roughness: 0.38, clearcoatRoughness: 0.06, sheen: 0.2 }),
    { pattern: 'aneurysm', detailA: ANATOMY.colors.aneurysmThin, detailB: ANATOMY.colors.atheroma, bump: 0.3, pulseAttr: true, thinAttr: true },
  );
  mat.name = 'aneurysm';
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'aneurysm';
  mesh.userData.kind = 'aneurysm';
  return { mesh, shape: s };
}
