import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { enhance, wetMaterial } from './shaders';

/** Dura-covered skull base and anterior clinoid process framing the deep field. */
export function buildSkullBase(): THREE.Group {
  const S = ANATOMY.skullBase;
  const group = new THREE.Group();
  group.name = 'skullBase';
  const duraMat = enhance(wetMaterial(ANATOMY.colors.dura, { roughness: 0.5 }), { pattern: 'dura', detailA: '#9d2f33', bump: 0.35 });

  // Floor: a gently undulating sheet.
  const floor = new THREE.CircleGeometry(S.floor.size / 2, 96, 0, Math.PI * 2);
  const pos = floor.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    // shallow bowl with gentle undulation (middle / anterior cranial fossa floor)
    pos.setZ(i, 1.2 * Math.sin(x * 0.15) * Math.cos(y * 0.11) + 0.0035 * (x * x + y * y));
  }
  floor.computeVertexNormals();
  const fm = new THREE.Mesh(floor, duraMat);
  fm.position.set(...S.floor.center);
  fm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...S.floor.normal).normalize());
  fm.userData.kind = 'dura';
  group.add(fm);

  // Anterior clinoid: a tapered, rounded cone from its base on the sphenoid towards its tip.
  const base = new THREE.Vector3(...S.clinoid.base), tip = new THREE.Vector3(...S.clinoid.tip);
  const len = base.distanceTo(tip);
  // tapered, slightly flattened capsule: broad where it joins the lesser sphenoid wing
  const geo = new THREE.CapsuleGeometry(S.clinoid.radius, len, 8, 32);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = THREE.MathUtils.clamp((y + len / 2) / (len + S.clinoid.radius), 0, 1);
    const k = THREE.MathUtils.lerp(1.15, 0.35, t);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k * 0.75);
  }
  geo.computeVertexNormals();
  const clinoid = new THREE.Mesh(geo, duraMat);
  clinoid.position.copy(base).lerp(tip, 0.5);
  clinoid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(base).normalize());
  clinoid.userData.kind = 'dura';
  group.add(clinoid);
  return group;
}
