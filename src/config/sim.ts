/**
 * SIMULATION TUNING — tool behaviour, risk and scoring constants.
 * (Anatomy sizes/positions live in anatomy.ts.)
 */
export const SIM = {
  retraction: {
    /** Fissure opening allowed before any sylvian arachnoid is cut (0..1). */
    baseAllowed: 0.12,
    /** Opening considered excessive (sustained pressure → contusion / venous infarction). */
    excessive: 0.9,
    /** Spatula drag sensitivity: opening change per screen pixel. */
    dragPerPx: 0.004,
  },
  rupture: {
    /** Hidden risk at which the dome ruptures (randomised ±20% per session). */
    threshold: 1.0,
    /** Risk added per mm of dissector drag across the dome; bleb multiplies it. */
    dissectorOnDome: 0.035,
    suctionOnDome: 0.02, // per second of contact
    blebMultiplier: 5,
    /** Coagulating the dome with bipolar. */
    bipolarOnDome: 0.25, // per second
    /** Blood pressure multiplier applied later by the vitals model (M4). */
  },
  dissection: {
    /** Dissector drag work (mm) needed to free one adhesion strand. */
    strandWork: 2.0,
  },
  bipolar: {
    /** Seconds of contact to leave a coagulation mark / seal a bleeding point. */
    coagTime: 0.6,
  },
  clip: {
    /** Yasargil-type permanent clip, straight or curved. */
    bladeLength: 7,
    bladeWidth: 1.0,
    bladeThickness: 0.45,
    openGap: 4.6,
    curvedBend: 0.55, // radians of total blade curvature for the curved clip
    rotateStep: Math.PI / 24,
    depthStep: 0.4,
  },
  vitals: {
    baseHr: 72,
    baseMap: 88,
    /** Blood loss (ml) compensated with little change in pressure. */
    compensatedMl: 350,
    /** Temporary occlusion considered safe (s); MEP starts falling after this. */
    safeOcclusionS: 300,
    /** MEP % lost per second of ischaemic insult. */
    mepLossPerS: 0.18,
    /** Below this MAP ischaemia progresses faster. */
    mepHypotension: 70,
  },
  bleed: {
    /** Rupture bleeding (ml/s) at normal pressure with full inflow. */
    ruptureMlPerS: 4.5,
    /** Arterial injury of a major vessel (ml/s). */
    arterialMlPerS: 2.2,
    /** Ooze from a small vessel (ml/s per unit injury rate). */
    oozeMlPerS: 0.18,
    /** Suction capacity (ml/s) when the tip is in blood. */
    suctionMlPerS: 2.4,
    /** Natural drainage out of the field (ml/s). */
    drainMlPerS: 0.03,
    /** Pool rise per ml in the cavity (mm). */
    mmPerMl: 1.1,
    maxPoolMm: 26,
    /** Gravity in the head frame: supine, head turned left ~30° and extended. */
    gravity: [0.45, 0.25, -0.86] as [number, number, number],
  },
  eval: {
    /** Clip plane this far out along the neck (mm) still counts as flush with the parent artery. */
    flushNeckMm: 0.6,
    /** Distance over which the sac widens from neck to dome (mm). */
    neckFlare: 2.8,
    /** Neck closure at which the sac is considered excluded from the circulation. */
    sealedAt: 0.95,
    /** Length of each branch checked for entrapment (mm). */
    branchCheckMm: 5,
    /** Residual neck (mm) worth flagging. */
    residualWarnMm: 1.0,
    /** ICA stenosis (fraction) worth flagging. */
    stenosisWarn: 0.3,
  },
  stages: {
    /** Fissure opening that counts as "opened" for stage 1 (0..1). */
    openingGoal: 0.6,
    /** Seconds the cursor must rest on a structure to identify it. */
    identifyDwell: 0.8,
  },
  tempClip: {
    bladeLength: 5,
    openGap: 4.2,
  },
};
