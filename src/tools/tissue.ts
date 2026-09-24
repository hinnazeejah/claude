import * as THREE from 'three';
import type { Anatomy } from '../anatomy';
import type { ArachnoidSegment } from '../anatomy/arachnoid';
import type { Adhesion } from '../anatomy/adhesions';
import { bus } from '../core/events';
import { logEvent, state, sylvianCutFraction } from '../core/state';
import { tween } from '../core/tween';
import { SIM } from '../config/sim';

/** Tissue operations shared by several tools. */

export function initTissueState(a: Anatomy): void {
  for (const s of a.arachnoid) state.arachnoid.total[s.patch] = (state.arachnoid.total[s.patch] ?? 0) + 1;
  for (const h of a.adhesions) state.adhesions.total[h.group] = (state.adhesions.total[h.group] ?? 0) + 1;
  for (const g of ['proximalNeck', 'distalNeck', 'dome'] as const) state.adhesions.freed[g] = 0;
  updateAllowedOpening();
}

/** The arachnoid still bridging the fissure limits how far it can be opened. */
export function updateAllowedOpening(): void {
  const b = SIM.retraction.baseAllowed;
  state.retraction.allowed = b + (1 - b) * sylvianCutFraction();
}

export function cutArachnoid(seg: ArachnoidSegment, point?: THREE.Vector3): void {
  if (seg.cut) return;
  seg.cut = true;
  state.arachnoid.cut[seg.patch] = (state.arachnoid.cut[seg.patch] ?? 0) + 1;
  logEvent('arachnoid-cut', seg.patch);
  updateAllowedOpening();
  bus.emit('arachnoid:cut', { patch: seg.patch });
  // the cut membrane springs back and shrivels towards its attachments
  const m = seg.mesh;
  const g = m.geometry;
  g.computeBoundingBox();
  const c = point ? m.worldToLocal(point.clone()) : g.boundingBox!.getCenter(new THREE.Vector3());
  const P = g.attributes.position as THREE.BufferAttribute;
  const base = (P.array as Float32Array).slice();
  m.userData.noPick = true;
  tween(0.45, k => {
    const e = 1 - Math.pow(1 - k, 3);
    for (let i = 0; i < P.count; i++) {
      const x = base[3 * i], y = base[3 * i + 1], z = base[3 * i + 2];
      const d = Math.hypot(x - c.x, y - c.y, z - c.z);
      const push = e * Math.min(3, 2.5 / (d + 0.5));
      P.setXYZ(i, x + ((x - c.x) / (d + 1e-3)) * push, y + ((y - c.y) / (d + 1e-3)) * push, z + ((z - c.z) / (d + 1e-3)) * push);
    }
    P.needsUpdate = true;
    m.scale.setScalar(1 - 0.25 * e);
  }, () => (m.visible = false));
}

export function freeAdhesion(adh: Adhesion): void {
  if (adh.freed) return;
  adh.freed = true;
  state.adhesions.freed[adh.group] = (state.adhesions.freed[adh.group] ?? 0) + 1;
  const remaining = state.adhesions.total[adh.group] - state.adhesions.freed[adh.group];
  logEvent('adhesion-freed', adh.group);
  bus.emit('adhesion:freed', { group: adh.group, remaining });
  adh.mesh.children.forEach(c => (c.userData.noPick = true));
  tween(0.25, k => adh.mesh.scale.setScalar(1 - 0.9 * k), () => (adh.mesh.visible = false));
}

/** Clamp and apply a requested fissure opening. Returns false if it hit the arachnoid limit. */
export function requestOpening(goal: number): boolean {
  const limited = goal > state.retraction.allowed + 1e-3;
  bus.emit('anatomy:opening', THREE.MathUtils.clamp(goal, 0, state.retraction.allowed));
  return !limited;
}
