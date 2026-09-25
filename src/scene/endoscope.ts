import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import type { AneurysmShape } from '../anatomy/aneurysm';
import { bus } from '../core/events';

/**
 * Endoscope picture-in-picture: a 2.7 mm, 30° scope parked behind the aneurysm (on the far side
 * from the microscope), looking back at the neck, the back wall of the ICA, the PCom and the
 * anterior choroidal artery — exactly what the microscope cannot see around a clip.
 */
export class EndoscopeView {
  active = false;
  camera = new THREE.PerspectiveCamera(82, 1, 0.3, 150);
  private light = new THREE.PointLight('#fff4e6', 2.2, 0, 0);
  private frame: HTMLElement;

  constructor(scene: THREE.Scene, shape: AneurysmShape, host: HTMLElement) {
    const forward = new THREE.Vector3(...ANATOMY.microscope.eyeDir).normalize().negate();
    const look = shape.neckCenter.clone().addScaledVector(shape.dir, 1.2);
    const pos = look.clone().addScaledVector(forward, 8.5).add(new THREE.Vector3(0, -1.5, 0)).addScaledVector(shape.dir, 2.5);
    this.camera.position.copy(pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
    this.light.position.copy(pos);
    this.light.visible = false;
    scene.add(this.light);
    this.frame = document.createElement('div');
    this.frame.className = 'pip';
    this.frame.innerHTML = '<span data-i18n="pipTitle">ENDOSCOPE 30°</span>';
    this.frame.style.display = 'none';
    host.appendChild(this.frame);
  }

  toggle(): void {
    this.active = !this.active;
    this.frame.style.display = this.active ? '' : 'none';
    bus.emit('endoscope:toggle', this.active);
  }

  /** Draw into the bottom-left corner after the main (post-processed) frame. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.active) return;
    const r = this.frame.getBoundingClientRect();
    const H = renderer.domElement.clientHeight;
    const x = r.left, y = H - r.bottom, s = r.width;
    const prevTM = renderer.toneMapping, prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, s, s);
    renderer.setViewport(x, y, s, s);
    renderer.setClearColor('#000');
    renderer.clear(true, true, false);
    this.light.visible = true;
    renderer.render(scene, this.camera);
    this.light.visible = false;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.clientWidth, H);
    renderer.toneMapping = prevTM;
    renderer.autoClear = prevAuto;
  }
}
