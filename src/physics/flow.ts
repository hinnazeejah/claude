import type { VesselId } from '../config/anatomy';
import type { ClipResult } from './clipEval';

/**
 * FLOW MODEL — relative flow (0..1 of normal) in each artery of the field, from:
 *   proximal ICA inflow (temporary clip), ICA stenosis from a clip, branches trapped by a clip
 *   or coagulated. The PCom receives retrograde collateral flow from the posterior circulation,
 *   so it (and the distal ICA through it) never goes completely silent under temporary occlusion.
 */
export interface FlowInput {
  tempClip: boolean;
  clip: ClipResult;
  occluded: Set<string>;
}

export type FlowMap = Record<VesselId | 'aneurysm', number>;

export function computeFlow(i: FlowInput): FlowMap {
  const inflow = i.tempClip ? 0 : 1;
  const collateral = 0.18; // back-filling through the PCom from the basilar system
  const stenosisLoss = Math.max(0, i.clip.icaStenosis - 0.3) * 1.2; // haemodynamic above ~30 %
  const distalIca = Math.max(collateral, inflow * Math.max(0, 1 - stenosisLoss));
  const f: FlowMap = {
    ica: distalIca,
    m1: distalIca,
    m2: distalIca,
    m3: distalIca,
    mcaTemporal: distalIca,
    a1: Math.max(0.35, distalIca), // cross-filled from the AComm
    pcom: i.tempClip ? 0.6 : 1, // reverses direction under temporary occlusion
    acha: distalIca,
    pca: 1,
    basilar: 1,
    aneurysm: inflow > 0 ? i.clip.sacFilling : collateral * i.clip.sacFilling,
  };
  if (!i.clip.pcomPatent) f.pcom = 0;
  if (!i.clip.achaPatent) f.acha = 0;
  for (const v of i.occluded) if (v in f) f[v as VesselId] = 0;
  return f;
}
