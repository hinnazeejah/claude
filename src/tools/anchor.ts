import * as THREE from 'three';

/**
 * A point glued to a mesh surface by triangle + barycentric coordinates, so marks and bleeding
 * points stay on tissue that deforms (e.g. a lobe moving with retraction).
 */
export class SurfaceAnchor {
  private idx: [number, number, number];
  private bary = new THREE.Vector3();

  constructor(public mesh: THREE.Mesh, faceIndex: number, point: THREE.Vector3) {
    const g = mesh.geometry;
    const i = g.index ? g.index.array : null;
    const f = faceIndex * 3;
    this.idx = i ? [i[f], i[f + 1], i[f + 2]] : [f, f + 1, f + 2];
    const [a, b, c] = this.corners();
    const local = mesh.worldToLocal(point.clone());
    THREE.Triangle.getBarycoord(local, a, b, c, this.bary);
  }

  private corners(): THREE.Vector3[] {
    const P = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    return this.idx.map(k => new THREE.Vector3().fromBufferAttribute(P, k));
  }

  position(target = new THREE.Vector3()): THREE.Vector3 {
    const [a, b, c] = this.corners();
    target.set(0, 0, 0).addScaledVector(a, this.bary.x).addScaledVector(b, this.bary.y).addScaledVector(c, this.bary.z);
    return this.mesh.localToWorld(target);
  }

  normal(target = new THREE.Vector3()): THREE.Vector3 {
    const [a, b, c] = this.corners();
    return target.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize().transformDirection(this.mesh.matrixWorld);
  }
}
