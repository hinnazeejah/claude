import * as THREE from 'three';
import { SurfaceAnchor } from './anchor';

/** Coagulation marks (blanched / charred pia) that stay glued to the tissue. */
export class Marks {
  group = new THREE.Group();
  private items: { anchor: SurfaceAnchor; mesh: THREE.Mesh }[] = [];
  private geo = new THREE.CircleGeometry(0.45, 20);
  private mat = new THREE.MeshStandardMaterial({
    color: '#6b3a22', roughness: 0.9, transparent: true, opacity: 0.75, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });

  constructor() {
    this.group.name = 'marks';
  }

  add(mesh: THREE.Mesh, faceIndex: number, point: THREE.Vector3, scale = 1): void {
    const anchor = new SurfaceAnchor(mesh, faceIndex, point);
    const m = new THREE.Mesh(this.geo, this.mat);
    m.scale.setScalar(scale * (0.8 + Math.random() * 0.4));
    m.userData.noPick = true;
    this.group.add(m);
    this.items.push({ anchor, mesh: m });
    this.place(this.items[this.items.length - 1]);
  }

  private place(it: { anchor: SurfaceAnchor; mesh: THREE.Mesh }) {
    const p = it.anchor.position();
    const n = it.anchor.normal();
    it.mesh.position.copy(p).addScaledVector(n, 0.03);
    it.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  }

  /** Re-seat marks after tissue moved. */
  update(): void {
    this.items.forEach(it => this.place(it));
  }
}
