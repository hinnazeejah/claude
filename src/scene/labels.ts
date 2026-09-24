import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ANATOMY } from '../config/anatomy';
import { bus } from '../core/events';
import { t } from '../ui/i18n';

/** Toggleable anatomy labels (L key) — a learning aid, off by default. */
export class AnatomyLabels {
  private renderer: CSS2DRenderer;
  private group = new THREE.Group();
  private items: { el: HTMLElement; key: string }[] = [];
  visible = false;

  constructor(scene: THREE.Scene, host: HTMLElement) {
    this.renderer = new CSS2DRenderer({ element: host });
    this.group.visible = false;
    for (const l of ANATOMY.labels) {
      const el = document.createElement('div');
      el.className = 'alabel';
      const obj = new CSS2DObject(el);
      obj.position.set(...l.at);
      this.group.add(obj);
      this.items.push({ el, key: l.key });
    }
    scene.add(this.group);
    this.refresh();
    bus.on('lang', () => this.refresh());
    bus.on('view:labels', v => this.set(v));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private refresh(): void {
    this.items.forEach(i => (i.el.textContent = t(`a.${i.key}`)));
  }

  set(v: boolean): void {
    this.visible = v;
    this.group.visible = v;
    this.group.children.forEach(c => ((c as CSS2DObject).element.style.display = v ? '' : 'none'));
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.visible) this.renderer.render(scene, camera);
  }
}
