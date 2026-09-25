import { state } from '../core/state';
import { SIM } from '../config/sim';

/**
 * PROCEDURE STAGES. Each stage has short mentor guidance and sub-tasks whose `done` predicate
 * reads the simulation state. Sub-tasks are sticky: once ticked they stay ticked. A stage
 * completes when every required sub-task is done, which unlocks the next one.
 * Text lives in the i18n dictionary under `stage.<id>.*` and `task.<id>`.
 */
export interface SubTask {
  id: string;
  done: () => boolean;
  optional?: boolean;
  /** Optional [done, total] counter shown next to the task. */
  progress?: () => [number, number];
}

export interface Stage {
  id: string;
  tasks: SubTask[];
}

const cut = (prefix: string): [number, number] => {
  let d = 0, t = 0;
  for (const [k, n] of Object.entries(state.arachnoid.total)) {
    if (!k.startsWith(prefix)) continue;
    t += n;
    d += state.arachnoid.cut[k] ?? 0;
  }
  return [d, t];
};
/** Most of a membrane counts as opened — the last shreds are often out of reach. */
const mostlyCut = (prefix: string, frac = 0.75) => () => {
  const [d, t] = cut(prefix);
  return t === 0 || d / t >= frac;
};
const freed = (g: 'proximalNeck' | 'distalNeck') => (): [number, number] => [state.adhesions.freed[g] ?? 0, state.adhesions.total[g] ?? 0];
const allFreed = (g: 'proximalNeck' | 'distalNeck') => () => {
  const [d, t] = freed(g)();
  return d >= t;
};
const seen = (id: string) => () => state.identified.has(id);
/** A verification check that was done after the last clip change. */
const checkedAfterClip = (key: string) => () => (state.checks.get(key) ?? -Infinity) > state.lastClipChange && state.clips.length > 0;

export const STAGES: Stage[] = [
  {
    id: 'fissure',
    tasks: [
      { id: 'cutSuperficial', done: mostlyCut('sylvian-superficial'), progress: () => cut('sylvian-superficial') },
      { id: 'cutDeep', done: mostlyCut('sylvian-deep'), progress: () => cut('sylvian-deep') },
      { id: 'openFissure', done: () => state.retraction.opening >= SIM.stages.openingGoal },
    ],
  },
  {
    id: 'm1',
    tasks: [
      { id: 'seeM2', done: seen('m2'), optional: true },
      { id: 'seeM1', done: seen('m1') },
      { id: 'seeA1', done: seen('a1') },
    ],
  },
  {
    id: 'ica',
    tasks: [
      { id: 'cutCarotid', done: mostlyCut('carotid-cistern', 0.6), progress: () => cut('carotid-cistern') },
      { id: 'seeIca', done: seen('ica') },
      { id: 'seeOptic', done: seen('opticNerve') },
    ],
  },
  {
    id: 'neck',
    tasks: [
      { id: 'cutNeckArachnoid', done: mostlyCut('neck-arachnoid', 0.6), progress: () => cut('neck-arachnoid') },
      { id: 'seePcom', done: seen('pcom') },
      { id: 'seeAcha', done: seen('acha') },
      { id: 'freeProximal', done: allFreed('proximalNeck'), progress: freed('proximalNeck') },
      { id: 'freeDistal', done: allFreed('distalNeck'), progress: freed('distalNeck') },
    ],
  },
  {
    id: 'clip',
    tasks: [
      { id: 'tempClipOptional', done: () => state.tempClip.count > 0, optional: true },
      { id: 'applyClip', done: () => state.clips.length > 0 },
      { id: 'releaseTemp', done: () => state.clips.length > 0 && !state.tempClip.applied },
    ],
  },
  {
    id: 'patency',
    tasks: [
      { id: 'dopplerPcom', done: checkedAfterClip('doppler:pcom') },
      { id: 'dopplerAcha', done: checkedAfterClip('doppler:acha') },
      { id: 'icgAfterClip', done: checkedAfterClip('icg') },
    ],
  },
];
