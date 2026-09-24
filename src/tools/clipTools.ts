import * as THREE from 'three';
import { Tool, type ToolContext, type Verdict } from './tool';
import type { Target } from './picking';
import * as I from './instruments';
import { logEvent, state, type PlacedClip } from '../core/state';
import { bus } from '../core/events';
import { SIM } from '../config/sim';

/** If the nearest hit is intact arachnoid, deep instruments are blocked by it. */
function blockedOrFirst(hits: Target[], accept: (h: Target) => boolean): Target | null {
  for (const h of hits) {
    if (h.kind === 'arachnoid') return h;
    if (h.kind === 'adhesion') continue;
    if (accept(h)) return h;
  }
  return null;
}

let clipId = 0;

/**
 * Permanent aneurysm clip. The ghost clip follows the cursor:
 *   Q / E  roll the clip around the microscope axis (which way the blades close)
 *   A / D  tilt the blades away from the microscope axis
 *   W / S  advance / withdraw the blade tips (blade depth)
 *   C      straight ↔ curved clip        click  apply        X  remove last clip
 * Aim: blades parallel to the ICA across the neck, tips just past the far side of the neck,
 * PCom and anterior choroidal artery outside the blades.
 */
export class ClipTool extends Tool {
  readonly id = 'clip' as const;
  private roll = 0;
  private tilt = THREE.MathUtils.degToRad(35);
  private depth = SIM.clip.bladeLength * 0.6;
  private ghosts: Record<'straight' | 'curved', I.ClipModel>;
  private ghostMat = new THREE.MeshPhysicalMaterial({ color: '#b7bec8', metalness: 0.9, roughness: 0.25, transparent: true, opacity: 0.55, envMapIntensity: 3 });
  private clipsGroup: THREE.Group;
  private pose: Omit<PlacedClip, 'id' | 'object' | 'variant'> | null = null;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.applier();
    this.ghosts = {
      straight: I.clipModel('straight', this.ghostMat),
      curved: I.clipModel('curved', this.ghostMat),
    };
    for (const g of Object.values(this.ghosts)) {
      g.group.traverse(o => (o.userData.noPick = true));
      g.group.visible = false;
      ctx.scene.add(g.group);
    }
    this.clipsGroup = new THREE.Group();
    this.clipsGroup.name = 'clips';
    ctx.anatomy.root.add(this.clipsGroup);
  }

  choose(hits: Target[]) {
    return blockedOrFirst(hits, h => h.kind !== 'clip');
  }
  judge(t: Target): Verdict {
    if (t.kind === 'aneurysm') return 'valid';
    if (t.kind === 'vessel') return 'danger';
    return 'invalid';
  }

  private ghost() {
    return this.ghosts[state.clipVariant];
  }

  deactivate(): void {
    Object.values(this.ghosts).forEach(g => (g.group.visible = false));
  }

  /** Compute the clip frame from the camera, roll, tilt and depth, and pose ghost + applier. */
  seat(t: Target): void {
    const cam = this.ctx.camera;
    const F = new THREE.Vector3(); cam.getWorldDirection(F);
    const R = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(F, this.roll);
    const r = R.clone().applyQuaternion(q);
    const qt = new THREE.Quaternion().setFromAxisAngle(r, this.tilt);
    const blade = F.clone().applyQuaternion(qt).normalize(); // into the field
    const close = r.clone(); // blades close along this axis
    const width = new THREE.Vector3().crossVectors(close, blade).normalize();
    const L = SIM.clip.bladeLength;
    const tips = t.point.clone().addScaledVector(blade, this.depth - L * 0.5);
    const head = tips.clone().addScaledVector(blade, -L);
    this.pose = { head, tips, bladeAxis: blade, closeAxis: close, widthAxis: width };

    Object.values(this.ghosts).forEach(g => (g.group.visible = false));
    const g = this.ghost().group;
    g.visible = t.kind !== 'arachnoid';
    g.matrix.makeBasis(blade, width, close).setPosition(head);
    g.matrix.decompose(g.position, g.quaternion, g.scale);

    // applier holds the clip at its head, shaft back out of the field
    const shaft = blade.clone().negate().add(R.clone().multiplyScalar(0.25)).normalize();
    const o = this.instrument.group;
    const z = shaft, x = close.clone().projectOnPlane(z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    o.matrix.makeBasis(x, y, z).setPosition(head.clone().addScaledVector(blade, -1.2));
    o.matrix.decompose(o.position, o.quaternion, o.scale);
  }

  update(): void {
    if (!this.target) Object.values(this.ghosts).forEach(g => (g.group.visible = false));
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    const C = SIM.clip;
    if (k === 'q') this.roll -= C.rotateStep;
    else if (k === 'e') this.roll += C.rotateStep;
    else if (k === 'a') this.tilt = Math.max(-1.4, this.tilt - C.rotateStep);
    else if (k === 'd') this.tilt = Math.min(1.4, this.tilt + C.rotateStep);
    else if (k === 'w') this.depth = Math.min(C.bladeLength + 2, this.depth + C.depthStep);
    else if (k === 's') this.depth = Math.max(-1, this.depth - C.depthStep);
    else if (k === 'c') {
      state.clipVariant = state.clipVariant === 'straight' ? 'curved' : 'straight';
      bus.emit('tool:select', 'clip'); // refresh toolbar label
    } else if (k === 'x') this.removeLast();
    else return false;
    return true;
  }

  onDown(t: Target | null): void {
    if (!t) return;
    if (t.kind === 'arachnoid') { this.notice('nArachnoidBlocks', 'info'); return; }
    if (this.judge(t) === 'invalid' || !this.pose) { this.notice('nClipNoTarget', 'info'); return; }
    const model = I.clipModel(state.clipVariant, I.MATS.titanium);
    model.setGap(0.35); // blades closed on the flattened neck
    const g = model.group;
    g.matrix.copy(this.ghost().group.matrix);
    g.matrix.decompose(g.position, g.quaternion, g.scale);
    const placed: PlacedClip = {
      id: ++clipId, variant: state.clipVariant, object: g,
      head: this.pose.head.clone(), tips: this.pose.tips.clone(),
      bladeAxis: this.pose.bladeAxis.clone(), closeAxis: this.pose.closeAxis.clone(), widthAxis: this.pose.widthAxis.clone(),
    };
    g.traverse(o => { o.userData.kind = 'clip'; o.userData.clipId = placed.id; });
    this.clipsGroup.add(g);
    state.clips.push(placed);
    state.clipsApplied++;
    logEvent('clip-applied', `${placed.variant}`);
    bus.emit('clip:applied', { variant: placed.variant });
    this.notice('nClipApplied', 'info');
  }

  removeLast(): void {
    const c = state.clips.pop();
    if (!c) return;
    this.clipsGroup.remove(c.object);
    logEvent('clip-removed');
    bus.emit('clip:removed', {});
  }
}

/**
 * Temporary clip on the proximal ICA (below the aneurysm): stops inflow so the sac softens or a
 * rupture can be controlled. Click the ICA to apply, click the clip again to release. The
 * occlusion timer runs while it is on — keep it short (a few minutes).
 */
export class TempClipTool extends Tool {
  readonly id = 'tempClip' as const;
  private ghostMat = new THREE.MeshPhysicalMaterial({ color: '#d8b04a', metalness: 0.95, roughness: 0.25, transparent: true, opacity: 0.55 });
  private ghost: I.ClipModel;
  private applied: THREE.Group | null = null;
  private samples: { p: THREE.Vector3; t: THREE.Vector3 }[] = [];
  private frame: THREE.Matrix4 | null = null;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.applier();
    this.ghost = I.clipModel('temporary', this.ghostMat);
    this.ghost.group.traverse(o => (o.userData.noPick = true));
    this.ghost.group.visible = false;
    ctx.scene.add(this.ghost.group);
    const curve = ctx.anatomy.vessels.get('ica')!.tubes[0].curve;
    for (let i = 0; i <= 200; i++) this.samples.push({ p: curve.getPointAt(i / 200), t: curve.getTangentAt(i / 200) });
  }

  choose(hits: Target[]) {
    if (hits[0]?.object.userData.tempClip) return hits[0];
    return blockedOrFirst(hits, h => h.kind !== 'clip');
  }
  private proximalIca(t: Target) {
    return t.kind === 'vessel' && t.structure === 'ica' && t.point.y < this.ctx.anatomy.aneurysmShape.neckCenter.y - 2.2;
  }
  judge(t: Target): Verdict {
    if (t.object.userData.tempClip) return 'valid';
    return this.proximalIca(t) && !this.applied ? 'valid' : 'invalid';
  }
  deactivate(): void {
    this.ghost.group.visible = false;
  }

  seat(t: Target, shaftDir: THREE.Vector3, openAxis: THREE.Vector3): void {
    super.seat(t, shaftDir, openAxis);
    this.ghost.group.visible = false;
    this.frame = null;
    if (!this.proximalIca(t) || this.applied) return;
    // nearest centreline point: blades straddle the ICA perpendicular to its axis
    let best = this.samples[0], bd = Infinity;
    for (const s of this.samples) { const d = s.p.distanceToSquared(t.point); if (d < bd) { bd = d; best = s; } }
    const F = new THREE.Vector3(); this.ctx.camera.getWorldDirection(F);
    const blade = F.clone().projectOnPlane(best.t).normalize();
    const close = best.t.clone();
    const width = new THREE.Vector3().crossVectors(close, blade).normalize();
    const L = SIM.tempClip.bladeLength;
    const head = best.p.clone().addScaledVector(blade, -L * 0.55);
    this.frame = new THREE.Matrix4().makeBasis(blade, width, close).setPosition(head);
    const g = this.ghost.group;
    g.visible = true;
    this.frame.decompose(g.position, g.quaternion, g.scale);
  }

  update(): void {
    if (!this.target) this.ghost.group.visible = false;
  }

  onDown(t: Target | null): void {
    if (!t) return;
    if (t.kind === 'arachnoid') { this.notice('nArachnoidBlocks', 'info'); return; }
    if (t.object.userData.tempClip) { this.release(); return; }
    if (!this.frame) { this.notice('nTempClipWhere', 'info'); return; }
    const m = I.clipModel('temporary', I.MATS.gold);
    m.setGap(0.9);
    this.frame.decompose(m.group.position, m.group.quaternion, m.group.scale);
    m.group.traverse(o => { o.userData.kind = 'clip'; o.userData.tempClip = true; });
    this.ctx.anatomy.root.add(m.group);
    this.applied = m.group;
    state.tempClip.applied = true;
    state.tempClip.since = state.time;
    state.tempClip.count++;
    logEvent('temp-clip-on');
    bus.emit('tempclip', { applied: true });
    this.notice('nTempClipOn', 'info');
  }

  release(): void {
    if (!this.applied) return;
    this.applied.removeFromParent();
    this.applied = null;
    state.tempClip.applied = false;
    state.tempClip.totalSeconds += state.time - state.tempClip.since;
    logEvent('temp-clip-off');
    bus.emit('tempclip', { applied: false });
    this.notice('nTempClipOff', 'info');
  }
}
