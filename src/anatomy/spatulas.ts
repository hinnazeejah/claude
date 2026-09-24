import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ANATOMY, type SpatulaDef } from '../config/anatomy';
import { castOnto, corridor } from './corridor';
import type { BrainParts } from './brain';

/**
 * Brain spatulas: thin malleable steel blades on a self-retaining arm. The blade tip rests on the
 * operculum over a cottonoid patty and holds the fissure open. Each blade re-seats itself on its
 * lobe whenever the lobes move, so it always sits on the tissue.
 */
export class Spatulas {
  group = new THREE.Group();
  private blades: { def: SpatulaDef; obj: THREE.Group }[] = [];

  constructor(private brain: BrainParts) {
    this.group.name = 'spatulas';
    const mat = new THREE.MeshPhysicalMaterial({
      color: ANATOMY.colors.metal, metalness: 0.8, roughness: 0.28, anisotropy: 0.7, clearcoat: 0.4, envMapIntensity: 3.5,
    });
    const cotton = new THREE.MeshStandardMaterial({ color: '#efe9de', roughness: 0.95 });
    for (const def of ANATOMY.spatulas) {
      const obj = new THREE.Group();
      obj.name = `spatula:${def.id}`;
      // local frame: +z from tip towards the handle, +y = away from the tissue
      const geo = new RoundedBoxGeometry(def.width, 0.6, def.length, 3, 0.28);
      geo.translate(0, 0.55, def.length / 2 - 1);
      const blade = new THREE.Mesh(geo, mat);
      blade.userData.kind = 'spatula';
      blade.userData.spatula = def.id;
      const pad = new THREE.Mesh(new RoundedBoxGeometry(def.width * 0.95, 0.5, 10, 2, 0.22), cotton);
      pad.position.set(0, 0.1, 4);
      pad.userData.kind = 'cottonoid';
      obj.add(blade, pad);
      this.group.add(obj);
      this.blades.push({ def, obj });
    }
  }

  /** Put each blade on its lobe surface (call after the lobes move). */
  seat(): void {
    const C = corridor();
    for (const { def, obj } of this.blades) {
      const lobe = this.brain[def.lobe];
      const out = new THREE.Vector3(...ANATOMY.lobes[def.lobe].dir).normalize();
      const from = C.at(def.depth).addScaledVector(C.right, def.offset);
      const hit = castOnto(lobe, from, out, 40);
      const n = hit ? hit.normal.clone().negate() : out.clone().negate(); // surface normal facing the corridor
      const tip = hit ? hit.point : from.clone().addScaledVector(out, 6);
      // blade runs back up the corridor, tilted outwards (away from the corridor axis)
      const along = C.eye.clone().addScaledVector(out, def.splay).normalize();
      // Blade face: between the tissue normal and the microscope axis, so the broad face of the
      // blade is visible (as the retracted opercula slope away from the corridor).
      const y = n.clone().negate().addScaledVector(C.eye, 0.9).normalize();
      const z = along.projectOnPlane(y).normalize();
      const x = new THREE.Vector3().crossVectors(y, z).normalize();
      const yy = new THREE.Vector3().crossVectors(z, x).normalize();
      obj.matrix.makeBasis(x, yy, z).setPosition(tip);
      obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
    }
  }
}
