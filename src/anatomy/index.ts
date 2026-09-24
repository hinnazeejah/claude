import * as THREE from 'three';
import { ANATOMY, type VesselId } from '../config/anatomy';
import { buildVessels, vesselLines, type Vessel } from './vessels';
import { buildAneurysm, type AneurysmShape } from './aneurysm';
import { loadBrain, Retraction, type BrainParts } from './brain';
import { buildArachnoid, type ArachnoidSegment } from './arachnoid';
import { Spatulas } from './spatulas';
import { buildSkullBase } from './skullBase';
import { buildOculomotor } from './nerves';

export interface Anatomy {
  root: THREE.Group;
  brain: BrainParts;
  vessels: Map<VesselId, Vessel>;
  aneurysm: THREE.Mesh;
  aneurysmShape: AneurysmShape;
  oculomotor: THREE.Mesh;
  arachnoid: ArachnoidSegment[];
  arachnoidGroup: THREE.Group;
  spatulas: Spatulas;
  retraction: Retraction;
  /** Current fissure opening 0..1. */
  opening: number;
  setOpening(v: number): void;
}

export async function buildAnatomy(modelUrl: string): Promise<Anatomy> {
  const root = new THREE.Group();
  root.name = 'anatomy';

  const brain = await loadBrain(modelUrl);
  root.add(brain.frontal, brain.temporal, brain.insula, brain.opticNerve, brain.tentorium);

  const vessels = buildVessels();
  vessels.forEach(v => root.add(v.group));

  const icaDef = ANATOMY.vessels.find(v => v.id === 'ica')!;
  const icaLine = vesselLines(icaDef)[0];
  const { mesh: aneurysm, shape } = buildAneurysm(icaLine, (icaDef.radius[0] + icaDef.radius[1]) / 2);
  root.add(aneurysm);

  const oculomotor = buildOculomotor();
  root.add(oculomotor);

  root.add(buildSkullBase());

  // Order matters: the retraction must remember the unretracted surfaces before anything is
  // cast onto them, and arachnoid sheets are built against the closed fissure.
  const retraction = new Retraction(brain);
  const { group: arachnoidGroup, segments } = buildArachnoid(brain, retraction);
  root.add(arachnoidGroup);

  const spatulas = new Spatulas(brain);
  root.add(spatulas.group);
  retraction.onApplied = () => spatulas.seat();
  const anatomy: Anatomy = {
    root, brain, vessels, aneurysm, aneurysmShape: shape, oculomotor,
    arachnoid: segments, arachnoidGroup, spatulas, retraction,
    opening: ANATOMY.lobes.initialOpening,
    setOpening(v: number) {
      this.opening = THREE.MathUtils.clamp(v, 0, 1);
      retraction.apply(this.opening);
    },
  };
  anatomy.setOpening(anatomy.opening);
  return anatomy;
}
