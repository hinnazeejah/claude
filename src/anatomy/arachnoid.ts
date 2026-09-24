import * as THREE from 'three';
import { ANATOMY, type Vec3 } from '../config/anatomy';
import { NOISE_GLSL } from './shaders';
import { castOnto, corridor } from './corridor';
import type { BrainParts, Retraction } from './brain';

/**
 * Arachnoid membranes: thin, translucent, slightly fibrous sheets that enclose the basal cisterns
 * and tether vessels. Opening them sharply (scissors) is what "opening the fissure" means.
 * Each patch is a sheet split into grid cells; each cell is its own mesh so it can be cut.
 */
export interface ArachnoidSegment {
  mesh: THREE.Mesh;
  patch: string;
  cut: boolean;
  /** Blunt-dissection work left (mm of dissector drag); scissors cut instantly. */
  work: number;
}

function makeMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: ANATOMY.colors.arachnoid,
    transparent: true,
    opacity: 0.2,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  // Fibrous look: modulate alpha with stretched noise; ragged, feathered borders.
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAP; varying vec2 vAUv; attribute vec2 aPatchUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAP = position; vAUv = aPatchUv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAP; varying vec2 vAUv;\n${NOISE_GLSL}`)
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        float fib = 0.5 + 0.5 * snoise(vAP * vec3(0.9, 2.6, 0.9));
        float rt = 1.0 - abs(snoise(vAP * 0.35 + 4.0));
        float trab = smoothstep(0.9, 0.99, rt);
        diffuseColor.a *= 0.55 + 0.45 * fib + 0.6 * trab;
        float edge = min(min(vAUv.x, 1.0 - vAUv.x), min(vAUv.y, 1.0 - vAUv.y));
        float ragged = 0.06 + 0.05 * snoise(vAP * 0.8);
        diffuseColor.a *= smoothstep(ragged - 0.04, ragged + 0.04, edge);
        if (diffuseColor.a < 0.01) discard;`,
      );
  };
  mat.customProgramCacheKey = () => 'arachnoid';
  return mat;
}

/** A sheet described by a point function over (u,v) ∈ [0,1]² plus a per-vertex retraction blend. */
type SheetFn = (u: number, v: number) => { p: THREE.Vector3; blend: number };

function fixedSheet(c: Vec3[], bulge: number): SheetFn {
  const [a, b, cc, d] = c.map(p => new THREE.Vector3(...p));
  const normal = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
  return (u, v) => {
    const p = a.clone().lerp(b, u).lerp(d.clone().lerp(cc, u), v);
    p.addScaledVector(normal, bulge * Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
    return { p, blend: 0.5 };
  };
}

/**
 * Sheet across the sylvian fissure: for each position across the corridor, cast a ray towards the
 * frontal lobe and one towards the temporal lobe; the membrane spans between the two hits and
 * sags gently towards the microscope.
 */
function corridorSheet(brain: BrainParts, depth: number, width: number, bulge: number, cols: number): SheetFn {
  const C = corridor();
  const fDir = new THREE.Vector3(...ANATOMY.lobes.frontal.dir).normalize();
  const tDir = new THREE.Vector3(...ANATOMY.lobes.temporal.dir).normalize();
  const edges: { f: THREE.Vector3; t: THREE.Vector3 }[] = [];
  for (let i = 0; i <= cols; i++) {
    const base = C.at(depth).addScaledVector(C.right, (i / cols - 0.5) * width);
    const f = castOnto(brain.frontal, base, fDir)?.point ?? base.clone().addScaledVector(fDir, 5);
    const t = castOnto(brain.temporal, base, tDir)?.point ?? base.clone().addScaledVector(tDir, 5);
    edges.push({ f: f.addScaledVector(fDir, -0.2), t: t.addScaledVector(tDir, -0.2) });
  }
  return (u, v) => {
    const x = u * cols, i = Math.min(cols - 1, Math.floor(x)), k = x - i;
    const f = edges[i].f.clone().lerp(edges[i + 1].f, k);
    const t = edges[i].t.clone().lerp(edges[i + 1].t, k);
    const p = t.lerp(f, v).addScaledVector(C.eye, -bulge * Math.sin(Math.PI * v));
    return { p, blend: v };
  };
}

export function buildArachnoid(brain: BrainParts, retraction: Retraction) {
  const group = new THREE.Group();
  group.name = 'arachnoid';
  const mat = makeMaterial();
  const segments: ArachnoidSegment[] = [];
  const sub = 6; // quads per cell edge

  for (const patch of ANATOMY.arachnoid) {
    const [gu, gv] = patch.grid;
    const sheet =
      patch.mode === 'corridor'
        ? corridorSheet(brain, patch.depth!, patch.width!, patch.bulge, gu * sub)
        : fixedSheet(patch.corners!, patch.bulge);
    for (let i = 0; i < gu; i++) for (let j = 0; j < gv; j++) {
      const pos: number[] = [], idx: number[] = [], puv: number[] = [];
      const blend: number[] = [];
      for (let y = 0; y <= sub; y++) for (let x = 0; x <= sub; x++) {
        const u = (i + x / sub) / gu, v = (j + y / sub) / gv;
        const s = sheet(u, v);
        pos.push(s.p.x, s.p.y, s.p.z);
        puv.push(u, v);
        blend.push(s.blend);
      }
      for (let y = 0; y < sub; y++) for (let x = 0; x < sub; x++) {
        const a = y * (sub + 1) + x;
        idx.push(a, a + sub + 1, a + 1, a + 1, a + sub + 1, a + sub + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aPatchUv', new THREE.Float32BufferAttribute(puv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = `arachnoid:${patch.id}:${i},${j}`;
      mesh.renderOrder = 2;
      mesh.userData.kind = 'arachnoid';
      mesh.userData.patch = patch.id;
      group.add(mesh);
      const seg: ArachnoidSegment = { mesh, patch: patch.id, cut: false, work: 4 };
      mesh.userData.segment = seg;
      segments.push(seg);
      if (patch.mode === 'corridor') retraction.addFollower({ mesh, blend: new Float32Array(blend) });
    }
  }
  return { group, segments };
}
