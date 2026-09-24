import * as THREE from 'three';
import type { HitPointInfo, MeshBVH } from 'three-mesh-bvh';
import type { AdhesionGroup } from '../core/state';
import type { AneurysmShape } from './aneurysm';
import { ANATOMY } from '../config/anatomy';

/**
 * Adhesions: fine arachnoid trabeculae and fibrous bands that tether the aneurysm.
 *   proximalNeck – between the neck and the PCom origin / proximal ICA. Freeing these shows you
 *                  where the PCom leaves the ICA so the clip blade can pass beside it.
 *   distalNeck   – between the neck and the anterior choroidal artery / distal ICA.
 *   dome         – between the dome and the oculomotor nerve, uncus and tentorium. Pulling on
 *                  these tugs the thin dome: dissect them last, or leave them alone.
 */
export interface Adhesion {
  mesh: THREE.Mesh;
  group: AdhesionGroup;
  /** Dissection work still needed (mm of dissector drag). */
  work: number;
  freed: boolean;
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function closestOn(meshes: THREE.Mesh[], p: THREE.Vector3, maxD: number) {
  let best: { point: THREE.Vector3; d: number } | null = null;
  const info = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 } as HitPointInfo;
  for (const m of meshes) {
    const bt = m.geometry.boundsTree as unknown as MeshBVH | undefined;
    if (!bt) continue;
    const local = m.worldToLocal(p.clone());
    const r = bt.closestPointToPoint(local, info, 0, maxD);
    if (r && (!best || r.distance < best.d)) best = { point: m.localToWorld(r.point.clone()), d: r.distance };
  }
  return best;
}

export function buildAdhesions(
  aneurysm: THREE.Mesh,
  shape: AneurysmShape,
  targets: Record<AdhesionGroup, THREE.Mesh[]>,
  strandWork: number,
): { group: THREE.Group; adhesions: Adhesion[] } {
  const group = new THREE.Group();
  group.name = 'adhesions';
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#f3eee6', roughness: 0.35, transparent: true, opacity: 0.8, clearcoat: 1, clearcoatRoughness: 0.1,
  });
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const icaAxis = new THREE.Vector3(0, 1, 0); // supraclinoid ICA runs roughly superiorly
  const P = aneurysm.geometry.attributes.position as THREE.BufferAttribute;
  const cfg = ANATOMY.adhesions;
  const rand = rng(cfg.seed);
  const adhesions: Adhesion[] = [];

  const classify = (p: THREE.Vector3): AdhesionGroup | null => {
    const rel = p.clone().sub(shape.neckCenter);
    const along = rel.dot(shape.dir);
    const axial = rel.dot(icaAxis);
    if (along > 0.2 && along < 2.2) {
      if (axial < -0.6) return 'proximalNeck';
      if (axial > 0.6) return 'distalNeck';
      return null;
    }
    if (along > shape.domeRadius * 0.9) return 'dome';
    return null;
  };

  const candidates: Record<AdhesionGroup, THREE.Vector3[]> = { proximalNeck: [], distalNeck: [], dome: [] };
  const v = new THREE.Vector3();
  const used = new Set(aneurysm.geometry.index!.array as unknown as number[]);
  for (const i of used) {
    v.fromBufferAttribute(P, i);
    const g = classify(v);
    if (g) candidates[g].push(v.clone());
  }

  for (const g of Object.keys(candidates) as AdhesionGroup[]) {
    const pts = candidates[g];
    const want = cfg.count[g];
    let made = 0, tries = 0;
    while (made < want && tries++ < want * 40 && pts.length) {
      const a = pts[Math.floor(rand() * pts.length)];
      const c = closestOn(targets[g], a, cfg.maxLength);
      if (!c || c.d < 0.4) continue;
      // strand: gently sagging curve between the sac and the neighbouring structure
      const mid = a.clone().lerp(c.point, 0.5).add(new THREE.Vector3(rand() - 0.5, rand() - 0.8, rand() - 0.5).multiplyScalar(0.5));
      const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, c.point.clone());
      const r = cfg.radius[0] + rand() * (cfg.radius[1] - cfg.radius[0]);
      const geo = new THREE.TubeGeometry(curve, 12, r, 6, false);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `adhesion:${g}:${made}`;
      mesh.userData.noPick = true;
      // strands are ~0.1 mm thick: pick through an invisible, fatter proxy
      const proxy = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.45, 6, false), proxyMat);
      proxy.userData.kind = 'adhesion';
      proxy.userData.group = g;
      proxy.userData.visual = mesh;
      mesh.add(proxy);
      group.add(mesh);
      const adh: Adhesion = { mesh, group: g, work: strandWork, freed: false };
      proxy.userData.adhesion = adh;
      adhesions.push(adh);
      made++;
    }
  }
  return { group, adhesions };
}
