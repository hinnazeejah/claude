import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { buildTube } from './tube';
import { enhance, wetMaterial } from './shaders';

/** Oculomotor nerve (CN III) as a fascicled tube along its config spline. */
export function buildOculomotor(): THREE.Mesh {
  const n = ANATOMY.nerves.oculomotor;
  const tube = buildTube(n.points.map(p => new THREE.Vector3(...p)), {
    radius: [n.radius, n.radius * 0.9], radialSegments: 24, segmentLength: 0.35, roundEnds: true,
  });
  const mat = enhance(wetMaterial(ANATOMY.colors.nerve, { roughness: 0.5 }), { pattern: 'nerve', detailA: '#c0413b', bump: 0.5 });
  const m = new THREE.Mesh(tube.geometry, mat);
  m.name = 'oculomotor';
  m.userData.kind = 'nerve';
  m.userData.part = 'oculomotor';
  return m;
}
