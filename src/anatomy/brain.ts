import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ANATOMY } from '../config/anatomy';
import { enhance, wetMaterial } from './shaders';

/**
 * Surface meshes from the atlas (see scripts/build-models.mjs):
 *   frontal   – orbital gyri, gyrus rectus, pars opercularis/triangularis/orbitalis (the frontal operculum)
 *   temporal  – temporal pole, superior/middle temporal gyri, uncus/parahippocampal gyrus
 *   insula    – the insular cortex at the floor of the sylvian fissure, over which the M2 trunks run
 *   opticNerve– optic nerve, chiasm and optic tract
 *   tentorium – tentorium cerebelli (its free edge borders the oculomotor nerve)
 */
export interface BrainParts {
  frontal: THREE.Mesh;
  temporal: THREE.Mesh;
  insula: THREE.Mesh;
  opticNerve: THREE.Mesh;
  tentorium: THREE.Mesh;
}

export async function loadBrain(url: string): Promise<BrainParts> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const get = (name: string) => {
    const m = gltf.scene.getObjectByName(name) as THREE.Mesh | undefined;
    if (!m) throw new Error(`anatomy.glb is missing "${name}"`);
    m.removeFromParent();
    return m;
  };
  const C = ANATOMY.colors;
  const brainMat = () =>
    enhance(wetMaterial(C.brain), { pattern: 'brain', detailA: C.brainVessel, detailB: '#5b3b63', bump: 0.9, pulseMm: 0.05 });
  const parts: BrainParts = {
    frontal: get('frontal'),
    temporal: get('temporal'),
    insula: get('insula'),
    opticNerve: get('opticNerve'),
    tentorium: get('tentorium'),
  };
  parts.frontal.material = brainMat();
  parts.temporal.material = brainMat();
  parts.insula.material = brainMat();
  parts.opticNerve.material = enhance(wetMaterial(C.nerve, { roughness: 0.5 }), { pattern: 'nerve', detailA: '#c0413b', bump: 0.4 });
  parts.tentorium.material = enhance(wetMaterial(C.dura, { roughness: 0.45 }), { pattern: 'dura', detailA: '#a2343a', bump: 0.3 });
  for (const [k, m] of Object.entries(parts)) {
    m.name = k;
    m.userData.kind = k === 'opticNerve' ? 'nerve' : k === 'tentorium' ? 'dura' : 'brain';
    m.userData.part = k;
    (m.material as THREE.Material).side = THREE.DoubleSide; // cropped atlas meshes are open at the edges
  }
  return parts;
}

/** A mesh that is not a lobe but must move with retraction (e.g. arachnoid bridging the fissure). */
export interface RetractionFollower {
  mesh: THREE.Mesh;
  /** Per-vertex blend: 0 = moves with the temporal lobe, 1 = with the frontal lobe. */
  blend: Float32Array;
}

/**
 * Sylvian fissure opening. Vertices are displaced away from the approach corridor with a gaussian
 * falloff, so the opercula part like a real retracted fissure (the far brain barely moves).
 * Done on the CPU so tool picking hits the displaced surface.
 */
export class Retraction {
  private base = new Map<THREE.Mesh, Float32Array>();
  private axisPoint: THREE.Vector3;
  private axisDir: THREE.Vector3;
  private followers: RetractionFollower[] = [];
  private frontalDir: THREE.Vector3;
  private temporalDir: THREE.Vector3;
  /** Called after every apply() (spatulas re-seat themselves on the moved surface). */
  onApplied: (() => void) | null = null;

  constructor(private parts: BrainParts) {
    for (const m of [parts.frontal, parts.temporal]) this.remember(m);
    const mic = ANATOMY.microscope;
    this.axisPoint = new THREE.Vector3(...mic.target);
    this.axisDir = new THREE.Vector3(...mic.eyeDir).normalize();
    this.frontalDir = new THREE.Vector3(...ANATOMY.lobes.frontal.dir).normalize();
    this.temporalDir = new THREE.Vector3(...ANATOMY.lobes.temporal.dir).normalize();
  }

  private remember(m: THREE.Mesh) {
    this.base.set(m, (m.geometry.attributes.position.array as Float32Array).slice());
  }

  addFollower(f: RetractionFollower): void {
    this.remember(f.mesh);
    this.followers.push(f);
  }

  /** Gaussian weight of a point relative to the corridor axis. */
  private weight(x: number, y: number, z: number): number {
    const s2 = 2 * ANATOMY.lobes.falloffSigma ** 2;
    const wx = x - this.axisPoint.x, wy = y - this.axisPoint.y, wz = z - this.axisPoint.z;
    const t = Math.max(0, wx * this.axisDir.x + wy * this.axisDir.y + wz * this.axisDir.z);
    const dx = wx - t * this.axisDir.x, dy = wy - t * this.axisDir.y, dz = wz - t * this.axisDir.z;
    return Math.exp(-(dx * dx + dy * dy + dz * dz) / s2);
  }

  /** opening: 0 (closed) … 1 (fully retracted). */
  apply(opening: number): void {
    const L = ANATOMY.lobes;
    const fk = -L.frontal.closeMm + opening * (L.frontal.closeMm + L.frontal.maxMm);
    const tk = -L.temporal.closeMm + opening * (L.temporal.closeMm + L.temporal.maxMm);
    const run = (mesh: THREE.Mesh, blendOf: (i: number) => number, normals: boolean) => {
      const base = this.base.get(mesh)!;
      const attr = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0, v = 0; i < base.length; i += 3, v++) {
        const w = this.weight(base[i], base[i + 1], base[i + 2]);
        const b = blendOf(v);
        const fx = this.frontalDir.x * fk * b + this.temporalDir.x * tk * (1 - b);
        const fy = this.frontalDir.y * fk * b + this.temporalDir.y * tk * (1 - b);
        const fz = this.frontalDir.z * fk * b + this.temporalDir.z * tk * (1 - b);
        arr[i] = base[i] + fx * w;
        arr[i + 1] = base[i + 1] + fy * w;
        arr[i + 2] = base[i + 2] + fz * w;
      }
      attr.needsUpdate = true;
      if (normals) mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
      mesh.geometry.boundingBox = null;
    };
    run(this.parts.frontal, () => 1, true);
    run(this.parts.temporal, () => 0, true);
    for (const f of this.followers) run(f.mesh, i => f.blend[i], true);
    this.onApplied?.();
  }
}
