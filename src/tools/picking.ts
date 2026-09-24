import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import type { AneurysmShape } from '../anatomy/aneurysm';

// Patch three.js once: every mesh gets a BVH-accelerated raycast.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export type AneurysmRegion = 'neck' | 'dome' | 'bleb';

/** What the cursor is on, in anatomical terms. */
export interface Target {
  object: THREE.Mesh;
  /** userData.kind of the mesh: vessel, aneurysm, brain, nerve, arachnoid, dura, adhesion, spatula, clip… */
  kind: string;
  /** Specific structure id (vessel id, lobe, arachnoid patch, adhesion group…). */
  structure: string;
  point: THREE.Vector3;
  /** World-space surface normal facing the viewer. */
  normal: THREE.Vector3;
  faceIndex: number;
  region?: AneurysmRegion;
  distance: number;
}

export function ensureBVH(root: THREE.Object3D): void {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.geometry.boundsTree) m.geometry.computeBoundsTree();
  });
}

/** Refit a mesh's BVH after its vertices moved (retraction). */
export function refitBVH(mesh: THREE.Mesh): void {
  const bt = mesh.geometry.boundsTree as unknown as { refit?: () => void } | undefined;
  if (bt?.refit) bt.refit();
  else mesh.geometry.computeBoundsTree();
}

export function aneurysmRegion(p: THREE.Vector3, s: AneurysmShape): AneurysmRegion {
  if (p.distanceTo(s.blebCenter) < s.blebRadius * 1.4) return 'bleb';
  const along = p.clone().sub(s.neckCenter).dot(s.dir);
  return along < 1.6 ? 'neck' : 'dome';
}

export class Picker {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  constructor(private camera: THREE.Camera, private root: THREE.Object3D, private shape: AneurysmShape) {
    this.ray.firstHitOnly = false;
  }

  /** All hits under the cursor, nearest first, classified. Invisible/ghost objects are skipped. */
  pick(clientX: number, clientY: number, w: number, h: number): Target[] {
    this.ndc.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObject(this.root, true);
    const out: Target[] = [];
    for (const h of hits) {
      const m = h.object as THREE.Mesh;
      if (!m.isMesh || !isVisible(m) || m.userData.noPick) continue;
      const kind = (m.userData.kind as string) ?? 'other';
      const n = h.face ? h.face.normal.clone().transformDirection(m.matrixWorld) : new THREE.Vector3(0, 0, 1);
      if (n.dot(this.ray.ray.direction) > 0) n.negate();
      const t: Target = {
        object: m, kind, point: h.point.clone(), normal: n, faceIndex: h.faceIndex ?? -1, distance: h.distance,
        structure: (m.userData.vessel ?? m.userData.part ?? m.userData.patch ?? m.userData.group ?? m.userData.spatula ?? kind) as string,
      };
      if (kind === 'aneurysm') t.region = aneurysmRegion(t.point, this.shape);
      out.push(t);
    }
    return out;
  }
}

function isVisible(o: THREE.Object3D | null): boolean {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}
