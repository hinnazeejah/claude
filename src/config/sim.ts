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
    strandWork: 3.0,
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
  tempClip: {
    bladeLength: 5,
    openGap: 4.2,
  },
};
