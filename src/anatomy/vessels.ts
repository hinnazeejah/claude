import * as THREE from 'three';
import { ANATOMY, type VesselDef, type VesselId } from '../config/anatomy';
import generated from './data/vessels.generated.json';
import { buildTube, type Tube } from './tube';
import { enhance, wetMaterial } from './shaders';

type Line = [number, number, number, number][];
const MODEL = generated as unknown as Record<string, Line[]>;

export interface Vessel {
  def: VesselDef;
  group: THREE.Group;
  tubes: Tube[];
  meshes: THREE.Mesh[];
}

/** Resolve a vessel definition to one or more centreline point lists (mm). */
export function vesselLines(def: VesselDef): THREE.Vector3[][] {
  const s = def.source;
  if ('points' in s) return [s.points.map(p => new THREE.Vector3(...p))];
  const lines = MODEL[s.model];
  if (!lines) throw new Error(`No model centreline "${s.model}"`);
  const pick = s.lines ? s.lines.map(i => lines[i]).filter(Boolean) : lines;
  return pick
    .map(line => {
      let pts = line;
      if (s.yRange) pts = pts.filter(p => p[1] >= s.yRange![0] && p[1] <= s.yRange![1]);
      if (s.reverse) pts = pts.slice().reverse();
      const off = s.offset ?? [0, 0, 0];
      return pts.map(p => new THREE.Vector3(p[0] + off[0], p[1] + off[1], p[2] + off[2]));
    })
    .filter(l => l.length >= 2);
}

const TINT_COLOR = {
  large: ANATOMY.colors.arteryLarge,
  medium: ANATOMY.colors.arteryMedium,
  small: ANATOMY.colors.arterySmall,
};

export function buildVessels(): Map<VesselId, Vessel> {
  const out = new Map<VesselId, Vessel>();
  const mats = new Map<string, THREE.MeshPhysicalMaterial>();
  for (const def of ANATOMY.vessels) {
    let mat = mats.get(def.tint);
    if (!mat) {
      mat = enhance(wetMaterial(TINT_COLOR[def.tint], { roughness: 0.42, clearcoatRoughness: 0.08 }), {
        pattern: 'artery', detailA: '#b3262b', bump: 0.4, pulseAttr: true,
      });
      mat.name = `artery-${def.tint}`;
      mats.set(def.tint, mat);
    }
    const group = new THREE.Group();
    group.name = `vessel:${def.id}`;
    const tubes: Tube[] = [];
    const meshes: THREE.Mesh[] = [];
    for (const pts of vesselLines(def)) {
      const tube = buildTube(pts, {
        radius: def.radius, pulse: def.pulse, delay: def.delay, roundEnds: true,
        radialSegments: def.tint === 'small' ? 16 : 28,
        segmentLength: def.tint === 'large' ? 0.25 : 0.35,
      });
      const mesh = new THREE.Mesh(tube.geometry, mat);
      mesh.name = def.id;
      mesh.userData.kind = 'vessel';
      mesh.userData.vessel = def.id;
      group.add(mesh);
      tubes.push(tube);
      meshes.push(mesh);
    }
    out.set(def.id, { def, group, tubes, meshes });
  }
  return out;
}
