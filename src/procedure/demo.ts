import * as THREE from 'three';
import type { Anatomy } from '../anatomy';
import type { ToolManager } from '../tools/manager';
import type { MicroscopeControls } from '../scene/microscope';
import type { ClipTool, TempClipTool } from '../tools/clipTools';
import { bus } from '../core/events';
import { state, type ToolId } from '../core/state';
import { cutArachnoid, freeAdhesion, requestOpening } from '../tools/tissue';
import { idealClipPose } from '../physics/clipEval';
import { buildEvalGeometry } from '../physics/geometry';
import { vesselLines } from '../anatomy/vessels';
import { ANATOMY } from '../config/anatomy';

class Cancelled extends Error {}

/**
 * DEMO MODE — plays the whole operation through the same tool APIs a user drives: the virtual
 * pointer moves the instruments, presses and drags them. Any real click or key press hands
 * control back to the user from exactly the current state.
 */
export class DemoDirector {
  running = false;
  private cancelled = false;

  constructor(private a: Anatomy, private tools: ToolManager, private controls: MicroscopeControls) {
    const takeover = (e: Event) => {
      if (!this.running || !e.isTrusted) return;
      if (e instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      this.stop(true);
    };
    window.addEventListener('pointerdown', takeover, true);
    window.addEventListener('keydown', takeover, true);
    window.addEventListener('wheel', takeover, true);
  }

  stop(byUser = false): void {
    if (!this.running) return;
    this.cancelled = true;
    this.running = false;
    this.tools.release();
    this.tools.virtual = false;
    this.controls.setTilt(0, 0);
    bus.emit('demo:running', false);
    if (byUser) bus.emit('notice', { key: 'demoYourControl', level: 'info' });
  }

  private async wait(ms: number) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (this.cancelled) throw new Cancelled();
      await new Promise(r => requestAnimationFrame(r));
    }
    if (this.cancelled) throw new Cancelled();
  }

  /** Glide the virtual pointer to a world point. */
  private async aim(p: THREE.Vector3, ms = 600) {
    const to = this.tools.screenOf(p);
    const from = { ...this.tools.pointer };
    const t0 = performance.now();
    while (true) {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = k * k * (3 - 2 * k);
      this.tools.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      if (k >= 1) break;
      await this.wait(16);
    }
  }

  private tool(id: ToolId) {
    this.tools.select(id);
  }

  private async click(p: THREE.Vector3, hold = 120) {
    await this.aim(p, 450);
    this.tools.press();
    await this.wait(hold);
    this.tools.release();
  }

  private centre(m: THREE.Mesh) {
    m.geometry.computeBoundingSphere();
    return m.localToWorld(m.geometry.boundingSphere!.center.clone());
  }

  private vesselPoint(id: string, t: number) {
    const def = ANATOMY.vessels.find(v => v.id === id)!;
    return new THREE.CatmullRomCurve3(vesselLines(def)[0]).getPointAt(t);
  }

  /** Rest the pointer on a structure until it is identified (falls back if it is hidden). */
  private async identify(key: string, p: THREE.Vector3) {
    await this.aim(p, 700);
    await this.wait(1300);
    if (!state.identified.has(key)) {
      state.identified.add(key);
      bus.emit('identified', key);
    }
  }

  private async cutPatches(prefix: string) {
    this.tool('scissors');
    for (const seg of this.a.arachnoid.filter(s => s.patch.startsWith(prefix) && !s.cut)) {
      await this.click(this.centre(seg.mesh), 90);
      if (!seg.cut) cutArachnoid(seg);
      await this.wait(160);
    }
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    this.tools.virtual = true;
    bus.emit('demo:running', true);
    try {
      await this.wait(1200);
      // 1 — open the sylvian fissure
      await this.cutPatches('sylvian-superficial');
      await this.cutPatches('sylvian-deep');
      this.tool('spatula');
      const blade = this.a.spatulas.group.children[1];
      await this.aim(blade.localToWorld(new THREE.Vector3(0, 0.9, 6)), 600);
      for (let i = 0; i <= 30; i++) {
        requestOpening(0.25 + (0.78 - 0.25) * (i / 30));
        await this.wait(40);
      }
      await this.wait(900);
      // 2 — identify M1
      this.tool('suction');
      await this.identify('m2', this.vesselPoint('m2', 0.3));
      await this.identify('m1', this.vesselPoint('m1', 0.45));
      await this.identify('a1', this.vesselPoint('a1', 0.25));
      // 3 — carotid cistern, ICA and optic nerve
      await this.cutPatches('carotid-cistern');
      this.tool('suction');
      await this.identify('ica', this.vesselPoint('ica', 0.55));
      await this.identify('opticNerve', new THREE.Vector3(1.5, 1.5, 7.0));
      // 4 — neck: look behind the ICA for the PCom and AChA, then free the neck
      await this.cutPatches('neck-arachnoid');
      this.controls.setTilt(0.45, -0.25);
      await this.wait(1200);
      this.tool('dissector');
      await this.identify('pcom', this.vesselPoint('pcom', 0.3));
      await this.identify('acha', this.vesselPoint('acha', 0.2));
      this.controls.setTilt(0, 0);
      await this.wait(900);
      for (const adh of this.a.adhesions.filter(x => x.group !== 'dome' && !x.freed)) {
        await this.aim(this.centre(adh.mesh), 450);
        this.tools.press();
        const s = this.tools.screenOf(this.centre(adh.mesh));
        for (let k = 0; k < 10 && !adh.freed; k++) {
          this.tools.move(s.x + (k % 2 ? 9 : -9), s.y + (k % 2 ? 5 : -5));
          await this.wait(70);
        }
        this.tools.release();
        if (!adh.freed) freeAdhesion(adh);
        await this.wait(150);
      }
      // 5 — temporary clip, definitive clip, release
      this.tool('tempClip');
      await this.click(this.vesselPoint('ica', 0.28), 150);
      await this.wait(700);
      this.tool('clip');
      const clipTool = this.tools.tools.clip as ClipTool;
      const F = new THREE.Vector3(...ANATOMY.microscope.eyeDir).normalize().negate();
      const pose = idealClipPose(buildEvalGeometry(), F);
      await this.aim(pose.head.clone().lerp(pose.tips, 0.5), 700);
      for (let i = 0; i < 60; i++) { clipTool.showGhost(pose); await this.wait(25); }
      clipTool.place(pose);
      await this.wait(900);
      (this.tools.tools.tempClip as TempClipTool).release();
      await this.wait(700);
      // 6 — Doppler on PCom and AChA, then ICG
      this.tool('doppler');
      for (const [id, t] of [['pcom', 0.35], ['acha', 0.3]] as const) {
        await this.aim(this.vesselPoint(id, t), 600);
        this.tools.press();
        await this.wait(1800);
        this.tools.release();
        state.checks.set(`doppler:${id}`, state.time);
      }
      this.tool('icg');
      this.tools.press();
      this.tools.release();
      await this.wait(9000);
      bus.emit('notice', { key: 'demoDone', level: 'info' });
      this.stop();
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
  }
}
