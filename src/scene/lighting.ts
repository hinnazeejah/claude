import * as THREE from 'three';

/**
 * Operating-microscope illumination: a warm coaxial light that travels with the objective and
 * throws a bright circle on the field, plus a very dim fill so the depths are not pure black.
 */
export class ScopeLight {
  spot: THREE.SpotLight;
  fill: THREE.HemisphereLight;

  constructor(scene: THREE.Scene) {
    this.spot = new THREE.SpotLight('#ffe2c2', 2.3, 0, THREE.MathUtils.degToRad(7), 0.65, 0);
    this.fill = new THREE.HemisphereLight('#ffe9dc', '#3a1a14', 0.12);
    scene.add(this.spot, this.spot.target, this.fill);
  }

  /** Keep the light coaxial with the camera (slightly offset, as in a real binocular scope). */
  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    this.spot.position.copy(camera.position).addScaledVector(right, 6);
    this.spot.target.position.copy(target);
    // cone just wider than the visible field
    this.spot.angle = THREE.MathUtils.degToRad(Math.min(12, camera.fov * 0.75 + 0.8));
  }
}
