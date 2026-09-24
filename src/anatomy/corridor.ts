import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';

/**
 * The surgical corridor: the default microscope axis from the target (IC-PC region) out through
 * the opened sylvian fissure. `right`/`up` match the default screen orientation.
 */
export function corridor() {
  const m = ANATOMY.microscope;
  const target = new THREE.Vector3(...m.target);
  const eye = new THREE.Vector3(...m.eyeDir).normalize();
  const up = new THREE.Vector3(...m.upHint).projectOnPlane(eye).normalize();
  const right = new THREE.Vector3().crossVectors(up, eye).normalize();
  return { target, eye, up, right, at: (d: number) => target.clone().addScaledVector(eye, d) };
}

const ray = new THREE.Raycaster();
/** First hit of a ray on a mesh (double-sided), or null. */
export function castOnto(mesh: THREE.Mesh, from: THREE.Vector3, dir: THREE.Vector3, far = 40) {
  ray.set(from, dir.clone().normalize());
  ray.far = far;
  const hit = ray.intersectObject(mesh, false)[0];
  if (!hit) return null;
  const n = hit.face ? hit.face.normal.clone() : dir.clone().negate();
  if (n.dot(dir) > 0) n.negate();
  return { point: hit.point.clone(), normal: n };
}
