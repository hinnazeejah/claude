/**
 * ANATOMY CONFIG — every size, position and colour of the surgical field lives here.
 *
 * Frame and units
 *   1 unit = 1 mm. Origin = the right ICA bifurcation (where the ICA splits into M1 and A1).
 *   +x = patient's LEFT (so everything on the right side has negative x, and "medial" is +x)
 *   +y = superior (towards the vertex)
 *   +z = anterior (towards the face)
 *
 * Where the geometry comes from
 *   - Brain lobes, insula, optic nerve/chiasm/tract and tentorium are real atlas meshes
 *     (BodyParts3D / Z-Anatomy, CC BY-SA), cropped and smoothed by scripts/build-models.mjs.
 *   - Context arteries (M1, M2, A1, PCA, basilar) follow centrelines extracted from the same atlas.
 *   - The supraclinoid ICA, PCom, anterior choroidal artery, oculomotor nerve and the aneurysm are
 *     defined here explicitly. The atlas compresses the supraclinoid ICA to ~1 mm, and this
 *     short segment is exactly where the operation happens, so it is modelled by hand with typical
 *     adult proportions.
 */

export type Vec3 = [number, number, number];

export type VesselId =
  | 'ica' | 'm1' | 'm2' | 'm3' | 'mcaTemporal' | 'a1' | 'pcom' | 'acha' | 'pca' | 'basilar';

export type VesselSource =
  /** Use centreline(s) extracted from the atlas model. `yRange` keeps only points within [min,max]. */
  | { model: string; lines?: number[]; yRange?: [number, number]; reverse?: boolean; offset?: Vec3 }
  /** Explicit control points (Catmull-Rom spline through them). */
  | { points: Vec3[] };

export interface VesselDef {
  id: VesselId;
  source: VesselSource;
  /** Radius (mm) at the start and end of each line; linearly tapered. */
  radius: [number, number];
  /** Which vessel feeds this one (used by the flow model). */
  parent?: VesselId;
  /** Relative wall appearance: thick-walled large arteries look paler, small ones redder. */
  tint: 'large' | 'medium' | 'small';
  /** Radial pulsation amplitude as a fraction of radius. */
  pulse: number;
  /** Pulse-wave arrival delay (fraction of a cardiac cycle) — distal vessels pulse slightly later. */
  delay: number;
}

export interface ArachnoidPatch {
  id: string;
  /** 'corridor': stretched across the fissure (edges found on the lobes); 'fixed': 4 corners. */
  mode: 'corridor' | 'fixed';
  depth?: number;
  width?: number;
  corners?: Vec3[];
  grid: [number, number];
  bulge: number;
}

export interface SpatulaDef {
  id: string;
  lobe: 'frontal' | 'temporal';
  /** Distance from the target along the corridor where the blade tip rests (mm). */
  depth: number;
  width: number;
  length: number;
  /** Outward tilt of the blade from the corridor axis. */
  splay: number;
  /** Sideways shift across the corridor (mm, + = screen right). */
  offset: number;
}

export const ANATOMY = {
  /* ------------------------------------------------------------------ microscope */
  microscope: {
    /** Point the scope looks at when the view is reset (roughly the IC-PC junction). */
    target: [-3.8, -5.0, 0.8] as Vec3,
    /**
     * Direction from the target towards the eyepiece. A right pterional transsylvian view comes
     * from anterolateral and slightly superior: through the opened sylvian fissure, over the
     * sphenoid ridge, towards the carotid cistern. (This is the most open corridor between the
     * orbital gyri and the temporal pole in the atlas geometry.)
     */
    eyeDir: [-0.6, 0.3, 0.74] as Vec3,
    /**
     * Screen "up" hint, perpendicular to the sylvian fissure so the frontal lobe sits at the top
     * and the temporal lobe at the bottom. Looking at a right-sided structure from in front, the
     * midline (optic nerve, chiasm) then falls on the RIGHT of the image, lateral on the left.
     */
    upHint: [0.08, 0.75, 0.65] as Vec3,
    /** Working distance of the objective lens (mm). Real microscopes use ~200–300 mm. */
    workingDistance: 250,
    /** Vertical field of view (degrees). 9° at 250 mm ≈ a 40 mm field (low magnification). */
    fovDeg: 9,
    fovMin: 1.8,
    fovMax: 13,
    /** How far the scope may be tilted away from the default axis (degrees). */
    maxTilt: 35,
    /** Depth-of-field: range (mm) around the focal point that stays sharp at low magnification. */
    focusRange: 14,
    bokehScale: 2.2,
  },

  /* ------------------------------------------------------------------ heart */
  heart: { baseHR: 72 },

  /* ------------------------------------------------------------------ arteries */
  vessels: [
    {
      // Internal carotid artery, supraclinoid (C7/communicating + ophthalmic) segment. It leaves
      // the cavernous sinus through the distal dural ring beneath the anterior clinoid process and
      // ascends lateral to the optic nerve to its terminal bifurcation. The PCom and anterior
      // choroidal arteries arise from its POSTERIOR wall — which faces away from you in this view,
      // so you must look around the ICA to see them.
      id: 'ica', tint: 'large', pulse: 0.045, delay: 0,
      source: { model: 'ica', yRange: [-17, 0.2] },
      radius: [2.05, 1.9],
    },
    {
      // M1 (sphenoidal segment of the middle cerebral artery): runs laterally in the depth of the
      // sylvian fissure. Following M1 medially is the classic way to find the ICA.
      id: 'm1', parent: 'ica', tint: 'medium', pulse: 0.04, delay: 0.03,
      source: { model: 'm1' },
      radius: [1.45, 1.3],
    },
    {
      // M2 trunks (insular segment) — superior and inferior divisions running over the insula.
      id: 'm2', parent: 'm1', tint: 'medium', pulse: 0.035, delay: 0.06,
      source: { model: 'm2' },
      radius: [1.05, 0.85],
    },
    { id: 'm3', parent: 'm2', tint: 'small', pulse: 0.03, delay: 0.08, source: { model: 'm3' }, radius: [0.8, 0.55] },
    { id: 'mcaTemporal', parent: 'm1', tint: 'small', pulse: 0.03, delay: 0.08, source: { model: 'mcaTemporal' }, radius: [0.75, 0.5] },
    {
      // A1 (precommunicating anterior cerebral artery): runs medially above the optic nerve
      // towards the anterior communicating artery.
      id: 'a1', parent: 'ica', tint: 'medium', pulse: 0.04, delay: 0.03,
      source: { model: 'a1' },
      radius: [1.1, 0.95],
    },
    {
      // Posterior communicating artery: from the posterior wall of the ICA it runs posteromedially,
      // above and medial to the oculomotor nerve, to join the posterior cerebral artery.
      // Its thalamoperforating branches are critical — PCom patency after clipping matters.
      id: 'pcom', parent: 'ica', tint: 'small', pulse: 0.04, delay: 0.04,
      source: {
        points: [
          [-3.5, -6.2, 1.9], [-3.1, -6.0, -0.4], [-1.9, -5.3, -3.0], [-0.2, -3.6, -5.6],
          [1.5, -1.2, -8.0], [2.9, 1.3, -9.9], [3.7, 3.0, -10.8],
        ],
      },
      radius: [0.8, 0.72],
    },
    {
      // Anterior choroidal artery: arises 2–4 mm distal to the PCom, also from the posterior wall,
      // and runs posterolaterally under the optic tract towards the choroidal fissure. It supplies
      // the internal capsule — occluding it with a clip can cause hemiplegia.
      id: 'acha', parent: 'ica', tint: 'small', pulse: 0.035, delay: 0.05,
      source: {
        points: [
          [-2.9, -2.9, 1.4], [-3.9, -3.2, -0.8], [-5.6, -3.6, -3.6], [-7.9, -3.4, -6.9],
          [-10.5, -2.5, -10.4], [-13.4, -1.3, -14.2],
        ],
      },
      radius: [0.5, 0.4],
    },
    {
      // Posterior cerebral artery (P1 from the basilar tip, then P2 around the midbrain).
      id: 'pca', parent: 'basilar', tint: 'medium', pulse: 0.035, delay: 0.05,
      source: { model: 'pca', lines: [0, 2] },
      radius: [1.05, 0.8],
    },
    { id: 'basilar', tint: 'large', pulse: 0.04, delay: 0.02, source: { model: 'basilar' }, radius: [1.5, 1.4] },
  ] as VesselDef[],

  /* ------------------------------------------------------------------ aneurysm */
  aneurysm: {
    // IC-PC aneurysms arise from the ICA wall at the distal angle of the PCom origin, where
    // haemodynamic stress is highest. This one projects posterolaterally and downward, towards
    // the oculomotor nerve and the tentorial edge (a classic cause of a third-nerve palsy).
    /** Centre of the neck on the ICA wall. */
    neckCenter: [-4.55, -5.2, 1.25] as Vec3,
    /** Projection direction of the dome (posterolateral + inferior). Normalised in code. */
    direction: [-0.55, -0.45, -0.7] as Vec3,
    /** Maximum dome diameter (mm). */
    domeDiameter: 6.6,
    /** Neck diameter (mm). Dome-to-neck ratio > 1.5 favours clipping. */
    neckDiameter: 4.0,
    /** Distance from neck plane to where the dome reaches full width (mm). */
    neckLength: 1.1,
    /** Small daughter sac on the dome: the thinnest, most fragile wall — do not touch it. */
    bleb: { direction: [-0.35, -0.85, -0.3] as Vec3, diameter: 1.7, height: 0.9 },
    pulse: 0.05,
  },

  /* ------------------------------------------------------------------ nerves */
  nerves: {
    // Oculomotor nerve (CN III): leaves the midbrain between the PCA and SCA, runs forward below
    // and lateral to the PCom, and enters the roof of the cavernous sinus. The aneurysm dome lies
    // just above it.
    oculomotor: {
      points: [
        [8.5, -9.5, -22.0], [4.5, -10.0, -15.5], [0.5, -10.8, -9.5], [-3.6, -11.8, -5.2],
        [-6.8, -12.8, -1.6], [-8.9, -14.2, 1.8], [-10.0, -16.2, 4.8],
      ] as Vec3[],
      radius: 1.15,
    },
  },

  /* ------------------------------------------------------------------ skull base */
  skullBase: {
    // Anterior clinoid process: the bony shelf lateral to the optic nerve under which the ICA
    // emerges. Shown here covered by dura.
    clinoid: { base: [-11.5, -13.8, 7.5] as Vec3, tip: [-6.2, -12.6, 2.6] as Vec3, radius: 2.8 },
    /** Dura of the skull base / middle fossa (a curved sheet below the field). */
    floor: { center: [-4, -21, -2] as Vec3, normal: [0.05, 1, 0.15] as Vec3, size: 150 },
  },

  /* ------------------------------------------------------------------ lobes */
  lobes: {
    /**
     * Retraction: the spatulas push the frontal lobe up/forward and the temporal lobe down/back.
     * Vertices near the approach corridor move the most (gaussian falloff), so the brain bends
     * rather than moving as a rigid block.
     */
    // closeMm: how far each operculum is pushed towards the corridor when the fissure is closed
    // (opening 0). The atlas fissure is anatomically "open", so this recreates the closed state
    // you meet after opening the dura. maxMm: extra retraction at opening 1.
    frontal: { dir: [0.05, 0.7, 0.7] as Vec3, closeMm: 7, maxMm: 6 },
    temporal: { dir: [-0.1, -0.75, -0.55] as Vec3, closeMm: 6, maxMm: 7 },
    falloffSigma: 15,
    /** Opening when the scene starts (0 = fissure closed, 1 = fully opened and retracted). */
    initialOpening: 0,
  },

  /* ------------------------------------------------------------------ arachnoid */
  /**
   * Arachnoid membranes form the cisterns around the vessels. Each patch is a bilinear sheet
   * through 4 corners (in order around the edge) split into `grid` cuttable segments.
   */
  arachnoid: [
    {
      // Superficial sylvian arachnoid bridging the frontal and temporal opercula. "corridor"
      // patches are stretched across the fissure at `depth` mm from the target towards the
      // microscope, `width` mm wide; their edges are found by ray-casting onto the two lobes and
      // they stretch with retraction.
      id: 'sylvian-superficial', mode: 'corridor', depth: 30, width: 20,
      grid: [4, 2] as [number, number], bulge: 1.2,
    },
    {
      // Deep sylvian arachnoid over M1 and the carotid cistern entrance.
      id: 'sylvian-deep', mode: 'corridor', depth: 15, width: 15,
      grid: [3, 2] as [number, number], bulge: 0.8,
    },
    {
      // Carotid cistern: between the ICA and the optic nerve.
      id: 'carotid-cistern', mode: 'fixed',
      corners: [[-3, 1, 6], [1, 1, 5], [1, -9, 5], [-4, -9, 6]] as Vec3[],
      grid: [3, 3] as [number, number], bulge: 0.8,
    },
    {
      // Arachnoid tethering the aneurysm neck and PCom (lateral to the ICA).
      id: 'neck-arachnoid', mode: 'fixed',
      corners: [[-7.5, -2.5, 2.5], [-5, -3, 4.5], [-5, -9, 3], [-8, -9, 1]] as Vec3[],
      grid: [3, 3] as [number, number], bulge: 0.6,
    },
  ] as ArachnoidPatch[],

  /* ------------------------------------------------------------------ spatulas */
  spatulas: [
    // Brain spatulas (self-retaining retractor blades). Each rests on its lobe where the
    // approach corridor meets the operculum, `depth` mm from the target towards the microscope,
    // and follows the lobe as the fissure opens. `splay` tilts the blade outwards.
    // Keep retraction gentle — sustained pressure causes venous infarction and contusion.
    { id: 'frontal', lobe: 'frontal', depth: 17, width: 5.5, length: 70, splay: 1.1, offset: -6 },
    { id: 'temporal', lobe: 'temporal', depth: 18, width: 5.5, length: 70, splay: 1.1, offset: -3 },
  ] as SpatulaDef[],

  /* ------------------------------------------------------------------ labels */
  /** Anchor points for the anatomy labels (L key). */
  labels: [
    { key: 'ica', at: [-3.9, -9.5, 3.2] as Vec3 },
    { key: 'm1', at: [-9.7, 5.8, 3.1] as Vec3 },
    { key: 'a1', at: [2.2, 3.2, 8.6] as Vec3 },
    { key: 'pcom', at: [-0.2, -3.6, -5.6] as Vec3 },
    { key: 'acha', at: [-7.9, -3.4, -6.9] as Vec3 },
    { key: 'aneurysm', at: [-7.2, -7.5, -1.9] as Vec3 },
    { key: 'opticNerve', at: [1.5, 1.5, 7.0] as Vec3 },
    { key: 'oculomotor', at: [-3.6, -11.8, -5.2] as Vec3 },
    { key: 'frontal', at: [-14, 14, 14] as Vec3 },
    { key: 'temporal', at: [-18, -10, 0] as Vec3 },
  ],

  /* ------------------------------------------------------------------ colours */
  colors: {
    brain: '#dc9c88',
    brainVessel: '#9b1f1f',
    arteryLarge: '#e7b9a8',
    arteryMedium: '#d98f7f',
    arterySmall: '#cf6f63',
    aneurysm: '#c46a64',
    aneurysmThin: '#8e1c24',
    atheroma: '#e9d29a',
    nerve: '#efe3cb',
    arachnoid: '#f6f1ea',
    dura: '#b3a79d',
    bone: '#e8dcc2',
    metal: '#c9ccd0',
  },
};

export type AnatomyConfig = typeof ANATOMY;
