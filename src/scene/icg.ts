import * as THREE from 'three';
import { bus } from '../core/events';
import type { FlowMap } from '../physics/flow';

/** Arrival delay (s) of the dye after it reaches the ICA, per vessel. */
const DELAY: Record<string, number> = {
  basilar: 0.1, pca: 0.3, ica: 0, pcom: 0.35, acha: 0.45, m1: 0.35, a1: 0.4, m2: 0.8, m3: 1.1, mcaTemporal: 1.1,
};
const BOLUS_ARRIVAL = 2.0; // s from injection to the field
const DURATION = 28;

/**
 * ICG videoangiography: the field switches to a near-infrared view in which only dye-filled
 * vessels glow. Vessels fill in arterial order according to the flow model: an occluded branch
 * stays dark, and an excluded aneurysm sac stays dark while the parent artery lights up.
 */
export class IcgView {
  active = false;
  t = 0;
  private saved = new Map<THREE.Mesh | THREE.Points, THREE.Material | THREE.Material[]>();
  private hidden: THREE.Object3D[] = [];
  private glow = new Map<THREE.Mesh, { mat: THREE.MeshBasicMaterial; key: string }>();
  private dark = new THREE.MeshBasicMaterial({ color: '#050605' });
  private parenchyma = new THREE.MeshBasicMaterial({ color: '#000000' });
  private tint = new THREE.Color('#e4ffe9');

  constructor(private scene: THREE.Scene) {}

  toggle(): void {
    if (this.active) this.stop();
    else this.start();
  }

  start(): void {
    this.active = true;
    this.t = 0;
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      const kind = m.userData.kind as string | undefined;
      if (kind === 'arachnoid' || m.userData.visual || (m.parent?.name === 'adhesions') || m.parent?.name === 'marks') {
        if (o.visible && (m.isMesh || (o as THREE.Points).isPoints)) { o.visible = false; this.hidden.push(o); }
        return;
      }
      if (!m.isMesh && !(o as THREE.Points).isPoints) return;
      this.saved.set(m, m.material);
      if (kind === 'vessel' || kind === 'aneurysm') {
        const mat = new THREE.MeshBasicMaterial({ color: '#000' });
        this.glow.set(m, { mat, key: kind === 'aneurysm' ? 'aneurysm' : (m.userData.vessel as string) });
        m.material = mat;
      } else if (kind === 'brain') m.material = this.parenchyma;
      else if ((o as THREE.Points).isPoints) o.visible = false, this.hidden.push(o);
      else m.material = this.dark;
    });
    bus.emit('icg:toggle', true);
  }

  stop(): void {
    this.active = false;
    for (const [m, mat] of this.saved) m.material = mat;
    this.saved.clear();
    this.glow.forEach(g => g.mat.dispose());
    this.glow.clear();
    this.hidden.forEach(o => (o.visible = true));
    this.hidden = [];
    bus.emit('icg:toggle', false);
  }

  update(dt: number, flow: FlowMap): void {
    if (!this.active) return;
    this.t += dt;
    const t = this.t - BOLUS_ARRIVAL;
    const washout = 1 - 0.4 * THREE.MathUtils.smoothstep(this.t, 14, DURATION);
    for (const { mat, key } of this.glow.values()) {
      let k: number;
      if (key === 'aneurysm') k = (flow.aneurysm ?? 0) * THREE.MathUtils.smoothstep(t, 0.6, 3.2);
      else k = ((flow as Record<string, number>)[key] ?? 1) * THREE.MathUtils.smoothstep(t, DELAY[key] ?? 0.5, (DELAY[key] ?? 0.5) + 1.1);
      mat.color.copy(this.tint).multiplyScalar(Math.min(1.4, k * washout * 1.3));
    }
    const blush = 0.07 * THREE.MathUtils.smoothstep(t, 2.5, 6) * washout;
    this.parenchyma.color.setRGB(blush * 0.8, blush, blush * 0.85);
    if (this.t > DURATION) this.stop();
  }
}
