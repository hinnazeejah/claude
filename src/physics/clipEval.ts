import * as THREE from 'three';
import type { AneurysmShape } from '../anatomy/aneurysm';
import type { PlacedClip } from '../core/state';
import { SIM } from '../config/sim';

/**
 * CLIP EVALUATION — purely geometric.
 *
 * A clip squeezes whatever lies between its blades when it closes: in clip-local coordinates
 * (x along the blades from the head, z along the closing direction, y across the blade width) that
 * is the thin slab 0 ≤ x ≤ L, |z| ≤ open gap / 2, |y| ≤ slab half-thickness.
 *
 *  - Neck closure: where the clip plane cuts the neck axis we take the chord of the sac cross
 *    section lying in the clip plane; closure = fraction of that chord captured by the blades.
 *  - Residual neck: how far out along the neck (from the ICA wall) the clip sits.
 *  - ICA stenosis: fraction of the ICA circumference captured near the neck.
 *  - Branch patency: a branch (PCom, AChA) is occluded if its first millimetres are captured.
 */
export interface ClipResult {
  neckClosure: number;
  residualNeckMm: number;
  icaStenosis: number;
  pcomPatent: boolean;
  achaPatent: boolean;
  /** Fraction of arterial inflow still entering the sac (0 = excluded). */
  sacFilling: number;
  /** Clip not on the aneurysm at all. */
  offTarget: boolean;
}

export interface EvalGeometry {
  shape: AneurysmShape;
  ica: { points: THREE.Vector3[]; radius: number };
  pcom: THREE.Vector3[];
  acha: THREE.Vector3[];
}

export const NO_CLIP: ClipResult = {
  neckClosure: 0, residualNeckMm: 0, icaStenosis: 0, pcomPatent: true, achaPatent: true, sacFilling: 1, offTarget: true,
};

const SLAB = 0.9; // mm: half the blade width plus compressed tissue

function toLocal(c: PlacedClip, p: THREE.Vector3) {
  const d = p.clone().sub(c.head);
  return { x: d.dot(c.bladeAxis), y: d.dot(c.widthAxis), z: d.dot(c.closeAxis) };
}

export function captured(c: PlacedClip, p: THREE.Vector3, gap = SIM.clip.openGap): boolean {
  const L = SIM.clip.bladeLength;
  const q = toLocal(c, p);
  return q.x >= -0.2 && q.x <= L + 0.2 && Math.abs(q.z) <= gap / 2 && Math.abs(q.y) <= SLAB;
}

/** Radius of the sac cross-section at distance `a` along the neck axis from the neck centre. */
function sacRadius(s: AneurysmShape, a: number): number {
  const reach = SIM.eval.neckFlare;
  const k = THREE.MathUtils.smoothstep(a, 0, reach);
  return s.neckRadius + (s.domeRadius - s.neckRadius) * k;
}

function evalOne(c: PlacedClip, g: EvalGeometry): ClipResult {
  const s = g.shape;
  const res: ClipResult = { ...NO_CLIP };
  // Where does the clip plane (normal = widthAxis) cross the neck axis?
  const n = c.widthAxis;
  const denom = s.dir.dot(n);
  if (Math.abs(denom) > 0.25) {
    const a = c.head.clone().sub(s.neckCenter).dot(n) / denom;
    if (a > -1.5 && a < 1.2 + s.domeRadius * 1.6) {
      const C = s.neckCenter.clone().addScaledVector(s.dir, a);
      const r = sacRadius(s, a);
      // sample the sac cross-section at that level; of the points inside the clip slab, how
      // many lie between the blades?
      const e1 = new THREE.Vector3(1, 0, 0).projectOnPlane(s.dir);
      if (e1.lengthSq() < 0.1) e1.set(0, 1, 0).projectOnPlane(s.dir);
      e1.normalize();
      const e2 = new THREE.Vector3().crossVectors(s.dir, e1);
      let inSlab = 0, hit = 0;
      const N = 17;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const u = (i / (N - 1)) * 2 - 1, v = (j / (N - 1)) * 2 - 1;
        if (u * u + v * v > 1) continue;
        const p = C.clone().addScaledVector(e1, u * r * 0.97).addScaledVector(e2, v * r * 0.97);
        const q = toLocal(c, p);
        if (Math.abs(q.y) > SLAB) continue;
        inSlab++;
        if (captured(c, p)) hit++;
      }
      res.neckClosure = inSlab ? hit / inSlab : 0;
      res.residualNeckMm = Math.max(0, a - SIM.eval.flushNeckMm);
      res.offTarget = res.neckClosure < 0.1;
    }
  }
  // ICA stenosis: how deep the closed blades reach into the lumen, relative to its diameter
  let worst = 0;
  const L = SIM.clip.bladeLength;
  for (const p of g.ica.points) {
    const q = toLocal(c, p);
    if (q.x < -0.3 || q.x > L + 0.3 || Math.abs(q.z) > SIM.clip.openGap / 2 + g.ica.radius) continue;
    const dist = Math.max(0, Math.abs(q.y) - SLAB);
    worst = Math.max(worst, g.ica.radius - dist);
  }
  res.icaStenosis = THREE.MathUtils.clamp(worst / (1.6 * g.ica.radius), 0, 1);
  const branchCaught = (line: THREE.Vector3[]) => {
    let len = 0;
    for (let i = 1; i < line.length && len < SIM.eval.branchCheckMm; i++) {
      const seg = line[i].distanceTo(line[i - 1]);
      const steps = Math.max(1, Math.ceil(seg / 0.25));
      for (let k = 0; k < steps; k++) {
        const p = line[i - 1].clone().lerp(line[i], k / steps);
        if (captured(c, p)) return true;
      }
      len += seg;
    }
    return false;
  };
  // start checking just outside the ICA lumen
  res.pcomPatent = !branchCaught(outsideIca(g.pcom, g));
  res.achaPatent = !branchCaught(outsideIca(g.acha, g));
  res.sacFilling = res.neckClosure >= SIM.eval.sealedAt ? 0 : 1 - res.neckClosure * 0.7;
  return res;
}

/** Densely resample a centreline and drop the part inside the ICA. */
function outsideIca(line: THREE.Vector3[], g: EvalGeometry): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(line);
  const pts = curve.getSpacedPoints(80);
  const inside = (p: THREE.Vector3) => g.ica.points.some(q => q.distanceTo(p) < g.ica.radius * 0.9);
  const i = pts.findIndex(p => !inside(p));
  return i < 0 ? [] : pts.slice(i);
}

/** Combine all applied clips. */
export function evaluateClips(clips: PlacedClip[], g: EvalGeometry): ClipResult {
  if (!clips.length) return { ...NO_CLIP };
  const rs = clips.map(c => evalOne(c, g));
  const best = rs.reduce((a, b) => (b.neckClosure > a.neckClosure ? b : a));
  return {
    neckClosure: best.neckClosure,
    residualNeckMm: best.residualNeckMm,
    icaStenosis: Math.max(...rs.map(r => r.icaStenosis)),
    pcomPatent: rs.every(r => r.pcomPatent),
    achaPatent: rs.every(r => r.achaPatent),
    sacFilling: Math.min(...rs.map(r => r.sacFilling)),
    offTarget: rs.every(r => r.offTarget),
  };
}

/**
 * The textbook clip for this aneurysm: blades in the plane of the neck just off the ICA wall,
 * parallel to the ICA, spanning the neck. Used by demo mode and the unit tests.
 */
export function idealClipPose(g: EvalGeometry, camForward: THREE.Vector3) {
  const s = g.shape;
  const L = SIM.clip.bladeLength;
  // local ICA direction at the neck
  const pts = g.ica.points;
  let k = 0;
  pts.forEach((p, i) => { if (p.distanceTo(s.neckCenter) < pts[k].distanceTo(s.neckCenter)) k = i; });
  const icaAxis = pts[Math.min(pts.length - 1, k + 3)].clone().sub(pts[Math.max(0, k - 3)]).normalize();
  // clip plane parallel to the ICA wall, facing out along the neck
  const n = s.dir.clone().projectOnPlane(icaAxis).normalize();
  const blade = icaAxis.clone();
  // blades advance away from the viewer's side if possible
  if (blade.dot(camForward) < 0 && Math.abs(blade.dot(camForward)) > 0.2) blade.negate();
  const close = new THREE.Vector3().crossVectors(blade, n).normalize(); // right-handed (blade, width, close)
  const C = s.neckCenter.clone().addScaledVector(n, SIM.eval.flushNeckMm + 0.35);
  // tips just past the far edge of the neck (so they stop short of the next branch)
  const tips = C.clone().addScaledVector(blade, s.neckRadius + 0.6);
  const head = tips.clone().addScaledVector(blade, -L);
  return { head, tips, bladeAxis: blade, closeAxis: close, widthAxis: n.clone() };
}
