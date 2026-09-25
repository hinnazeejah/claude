import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { bus } from '../core/events';

/**
 * Operating-microscope camera. The scope hangs at a fixed working distance and pivots around
 * its focal point, like a real counter-balanced stand:
 *   wheel              magnification (changes field of view, not distance)
 *   right drag         move the field (pan the focal point)
 *   middle / Alt+drag  tilt the scope around the focal point (limited cone)
 *   F                  refocus on the structure under the cursor
 *   R                  reset
 * Left click is left free for surgical tools.
 */
export class MicroscopeControls {
  readonly target = new THREE.Vector3();
  private goalTarget = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private goalYaw = 0;
  private goalPitch = 0;
  private fov: number;
  private goalFov: number;
  private baseEye: THREE.Vector3;
  private baseUp: THREE.Vector3;
  private baseRight: THREE.Vector3;
  private drag: { mode: 'pan' | 'tilt'; x: number; y: number } | null = null;
  /** Provides a world point under the given client coordinates (for F-focus). */
  pick: ((x: number, y: number) => THREE.Vector3 | null) | null = null;
  private mouse = { x: 0, y: 0 };
  enabled = true;

  constructor(private camera: THREE.PerspectiveCamera, private dom: HTMLElement) {
    const m = ANATOMY.microscope;
    this.baseEye = new THREE.Vector3(...m.eyeDir).normalize();
    const upHint = new THREE.Vector3(...m.upHint);
    this.baseUp = upHint.projectOnPlane(this.baseEye).normalize();
    this.baseRight = new THREE.Vector3().crossVectors(this.baseUp, this.baseEye).normalize();
    this.fov = this.goalFov = m.fovDeg;
    this.reset(true);

    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('pointerdown', e => this.onDown(e));
    window.addEventListener('pointermove', e => this.onMove(e));
    window.addEventListener('pointerup', () => (this.drag = null));
    dom.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', e => this.onKey(e));
  }

  /** Magnification relative to the lowest setting (display value, ×). */
  get magnification(): number {
    return (4 * Math.tan(THREE.MathUtils.degToRad(ANATOMY.microscope.fovMax / 2))) / Math.tan(THREE.MathUtils.degToRad(this.fov / 2));
  }

  reset(instant = false): void {
    this.goalTarget.set(...ANATOMY.microscope.target);
    this.goalYaw = this.goalPitch = 0;
    this.goalFov = ANATOMY.microscope.fovDeg;
    if (instant) {
      this.target.copy(this.goalTarget);
      this.yaw = this.pitch = 0;
      this.fov = this.goalFov;
    }
  }

  /** Tilt the scope (radians, within the allowed cone) — used by demo mode. */
  setTilt(yaw: number, pitch: number): void {
    const lim = THREE.MathUtils.degToRad(ANATOMY.microscope.maxTilt);
    this.goalYaw = THREE.MathUtils.clamp(yaw, -lim, lim);
    this.goalPitch = THREE.MathUtils.clamp(pitch, -lim, lim);
  }

  setFov(f: number): void {
    const m = ANATOMY.microscope;
    this.goalFov = THREE.MathUtils.clamp(f, m.fovMin, m.fovMax);
  }

  focusOn(p: THREE.Vector3): void {
    this.goalTarget.copy(p);
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.button === 2) this.drag = { mode: 'pan', x: e.clientX, y: e.clientY };
    else if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this.drag = { mode: 'tilt', x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }

  private onMove(e: PointerEvent): void {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    if (this.drag.mode === 'pan') {
      // world size of one pixel at the focal plane
      const h = 2 * ANATOMY.microscope.workingDistance * Math.tan(THREE.MathUtils.degToRad(this.fov / 2));
      const k = h / this.dom.clientHeight;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.goalTarget.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      this.clampTarget();
    } else {
      const lim = THREE.MathUtils.degToRad(ANATOMY.microscope.maxTilt);
      this.goalYaw = THREE.MathUtils.clamp(this.goalYaw - dx * 0.004, -lim, lim);
      this.goalPitch = THREE.MathUtils.clamp(this.goalPitch - dy * 0.004, -lim, lim);
    }
  }

  private clampTarget(): void {
    const home = new THREE.Vector3(...ANATOMY.microscope.target);
    const off = this.goalTarget.clone().sub(home);
    if (off.length() > 30) this.goalTarget.copy(home).addScaledVector(off.normalize(), 30);
  }

  private onWheel(e: WheelEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    const m = ANATOMY.microscope;
    this.goalFov = THREE.MathUtils.clamp(this.goalFov * Math.exp(e.deltaY * 0.0012), m.fovMin, m.fovMax);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.enabled || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'r') this.reset();
    if (k === 'f' && this.pick) {
      const p = this.pick(this.mouse.x, this.mouse.y);
      if (p) this.focusOn(p);
    }
    const step = 1.5;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    if (k === 'arrowleft') this.goalTarget.addScaledVector(right, -step);
    if (k === 'arrowright') this.goalTarget.addScaledVector(right, step);
    if (k === 'arrowup') this.goalTarget.addScaledVector(up, step);
    if (k === 'arrowdown') this.goalTarget.addScaledVector(up, -step);
    if (k === '+' || k === '=') this.goalFov = Math.max(ANATOMY.microscope.fovMin, this.goalFov / 1.15);
    if (k === '-') this.goalFov = Math.min(ANATOMY.microscope.fovMax, this.goalFov * 1.15);
  }

  update(dt: number): void {
    const a = 1 - Math.exp(-dt * 10);
    this.target.lerp(this.goalTarget, a);
    this.yaw += (this.goalYaw - this.yaw) * a;
    this.pitch += (this.goalPitch - this.pitch) * a;
    const prevFov = this.fov;
    this.fov += (this.goalFov - this.fov) * a;

    const q = new THREE.Quaternion()
      .setFromAxisAngle(this.baseUp, this.yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(this.baseRight, this.pitch));
    const eye = this.baseEye.clone().applyQuaternion(q);
    const up = this.baseUp.clone().applyQuaternion(q);
    this.camera.position.copy(this.target).addScaledVector(eye, ANATOMY.microscope.workingDistance);
    this.camera.up.copy(up);
    this.camera.lookAt(this.target);
    if (Math.abs(prevFov - this.fov) > 1e-4) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      bus.emit('view:magnification', this.magnification);
    }
    this.camera.updateMatrixWorld();
  }
}
