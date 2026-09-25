import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { aneurysmShape } from '../anatomy/aneurysm';
import { vesselLines } from '../anatomy/vessels';
import type { EvalGeometry } from './clipEval';

/** Geometry the clip evaluation needs, straight from the anatomy config. */
export function buildEvalGeometry(): EvalGeometry {
  const def = (id: string) => ANATOMY.vessels.find(v => v.id === id)!;
  const icaDef = def('ica');
  const icaCurve = new THREE.CatmullRomCurve3(vesselLines(icaDef)[0], false, 'centripetal');
  return {
    shape: aneurysmShape(),
    ica: { points: icaCurve.getSpacedPoints(90), radius: (icaDef.radius[0] + icaDef.radius[1]) / 2 },
    pcom: vesselLines(def('pcom'))[0],
    acha: vesselLines(def('acha'))[0],
  };
}
