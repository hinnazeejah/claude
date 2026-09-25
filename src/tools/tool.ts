import * as THREE from 'three';
import type { ToolId } from '../core/state';
import type { Anatomy } from '../anatomy';
import type { Instrument } from './instruments';
import type { Target } from './picking';
import type { Marks } from './marks';
import { bus } from '../core/events';

export interface ToolContext {
  anatomy: Anatomy;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  marks: Marks;
  /** World size of one screen pixel at the focal plane (mm). */
  mmPerPx(): number;
  /** Late-bound services (M5): ICG view, endoscope PiP, Doppler audio. */
  services: {
    icg?: { toggle(): void; active: boolean };
    endoscope?: { toggle(): void; active: boolean };
    doppler?: (flow: number | null) => void;
  };
}

/** How a tool treats what is under the cursor. */
export type Verdict = 'valid' | 'danger' | 'invalid';

/**
 * Base class for surgical tools. The ToolManager raycasts once per frame, lets the tool choose
 * which hit it interacts with, colours the hover outline by `judge`, seats the instrument on the
 * surface and forwards pointer / keyboard input.
 */
export abstract class Tool {
  abstract readonly id: ToolId;
  /** Which hand holds it — decides from which side the shaft enters the field. */
  hand: 'left' | 'right' = 'right';
  instrument!: Instrument;
  pressed = false;
  target: Target | null = null;

  constructor(protected ctx: ToolContext) {}

  /** Pick the hit this tool interacts with. Default: first hit that is not a membrane film. */
  choose(hits: Target[]): Target | null {
    return hits.find(h => h.kind !== 'arachnoid' && h.kind !== 'adhesion' && h.kind !== 'clip') ?? null;
  }

  abstract judge(t: Target): Verdict;

  /** Object to outline for this target (defaults to the hit mesh). */
  outlineOf(t: Target): THREE.Object3D {
    return (t.object.userData.visual as THREE.Object3D) ?? t.object;
  }

  onDown(_t: Target | null): void {}
  onDrag(_t: Target | null, _dxPx: number, _dyPx: number, _mm: number): void {}
  onUp(): void {}
  onKey(_e: KeyboardEvent): boolean { return false; }
  update(_dt: number): void {}
  activate(): void {}
  deactivate(): void {}

  /** Place/aim the instrument. Default: tip on the surface, shaft towards the microscope side. */
  seat(t: Target, shaftDir: THREE.Vector3, openAxis: THREE.Vector3): void {
    const tip = t.point.clone().addScaledVector(t.normal, this.instrument.tipClearance);
    const z = shaftDir.clone().normalize();
    const x = openAxis.clone().projectOnPlane(z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const o = this.instrument.group;
    o.matrix.makeBasis(x, y, z).setPosition(tip);
    o.matrix.decompose(o.position, o.quaternion, o.scale);
  }

  protected notice(key: string, level: 'info' | 'warn' | 'alarm' = 'warn'): void {
    bus.emit('notice', { key, level });
  }
}

/** Big arteries — never cut or coagulate these. */
export const LARGE_VESSELS = new Set(['ica', 'm1', 'a1', 'basilar', 'pca']);
