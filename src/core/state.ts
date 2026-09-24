import * as THREE from 'three';
import { bus } from './events';
import { SIM } from '../config/sim';

export type ToolId =
  | 'suction' | 'scissors' | 'bipolar' | 'dissector' | 'spatula'
  | 'clip' | 'icg' | 'doppler' | 'endoscope' | 'tempClip';

export type AdhesionGroup = 'proximalNeck' | 'distalNeck' | 'dome';

export interface Injury {
  id: number;
  kind: 'ooze' | 'arterial';
  structure: string;
  point: THREE.Vector3;
  /** Relative bleeding rate (used by the bleeding model in M4). */
  rate: number;
  stopped: boolean;
  time: number;
}

export interface PlacedClip {
  id: number;
  variant: 'straight' | 'curved';
  /** Head (spring end) and tip positions of the blade midline, world mm. */
  head: THREE.Vector3;
  tips: THREE.Vector3;
  /** Unit axes: along the blades, closing direction, blade width. */
  bladeAxis: THREE.Vector3;
  closeAxis: THREE.Vector3;
  widthAxis: THREE.Vector3;
  object: THREE.Object3D;
}

export interface LogEntry {
  t: number;
  type: string;
  detail?: string;
}

/**
 * The whole simulation state, in memory. Modules mutate it through small helpers so every
 * important change is logged (for the debrief) and broadcast on the event bus.
 */
export const state = {
  time: 0,
  tool: 'suction' as ToolId,
  clipVariant: 'straight' as 'straight' | 'curved',

  arachnoid: { total: {} as Record<string, number>, cut: {} as Record<string, number> },
  adhesions: { total: {} as Record<AdhesionGroup, number>, freed: {} as Record<AdhesionGroup, number> },

  /** Hidden rupture risk accumulator — never shown to the user. */
  ruptureRisk: 0,
  ruptureThreshold: SIM.rupture.threshold * (0.8 + Math.random() * 0.4),
  ruptured: false,

  retraction: { opening: 0, allowed: SIM.retraction.baseAllowed, excessiveSeconds: 0, max: 0 },

  injuries: [] as Injury[],
  coagulations: 0,
  /** Vessels deliberately or accidentally occluded (coagulated) — used by the flow model. */
  occluded: new Set<string>(),
  /** Permanent clips currently applied (pose data for evaluation in M5). */
  clips: [] as PlacedClip[],

  clipsApplied: 0,
  tempClip: { applied: false, since: 0, totalSeconds: 0, count: 0 },

  /** Structures the learner has identified (hover/Doppler — used by stages in M3). */
  identified: new Set<string>(),

  log: [] as LogEntry[],
};

export function logEvent(type: string, detail?: string): void {
  state.log.push({ t: state.time, type, detail });
}

let injuryId = 0;
export function addInjury(kind: Injury['kind'], structure: string, point: THREE.Vector3, rate: number): Injury {
  const inj: Injury = { id: ++injuryId, kind, structure, point: point.clone(), rate, stopped: false, time: state.time };
  state.injuries.push(inj);
  logEvent('injury', `${kind}:${structure}`);
  bus.emit('injury', inj);
  return inj;
}

/** Add to the hidden rupture risk; triggers rupture once past the threshold. */
export function addRuptureRisk(amount: number, cause: string): void {
  if (state.ruptured || amount <= 0) return;
  state.ruptureRisk += amount;
  if (state.ruptureRisk >= state.ruptureThreshold) triggerRupture(cause);
}

export function triggerRupture(cause: string, point?: THREE.Vector3): void {
  if (state.ruptured) return;
  state.ruptured = true;
  logEvent('rupture', cause);
  bus.emit('rupture', { cause, point: point?.clone() ?? null });
}

export function sylvianCutFraction(): number {
  let tot = 0, cut = 0;
  for (const [k, n] of Object.entries(state.arachnoid.total)) {
    if (!k.startsWith('sylvian')) continue;
    tot += n;
    cut += state.arachnoid.cut[k] ?? 0;
  }
  return tot ? cut / tot : 1;
}
