import * as THREE from 'three';
import { Tool, LARGE_VESSELS, type ToolContext, type Verdict } from './tool';
import type { Target } from './picking';
import * as I from './instruments';
import { addInjury, addRuptureRisk, logEvent, state, triggerRupture } from '../core/state';
import { bus } from '../core/events';
import { SIM } from '../config/sim';
import { cutArachnoid, freeAdhesion, requestOpening } from './tissue';
import type { ArachnoidSegment } from '../anatomy/arachnoid';
import type { Adhesion } from '../anatomy/adhesions';

/* ------------------------------------------------------------------ suction (left hand) */
/**
 * Suction keeps the field dry (clears blood and CSF, M4) and doubles as a gentle retractor.
 * Never park it on the thin dome — the negative pressure can tear it.
 */
export class SuctionTool extends Tool {
  readonly id = 'suction' as const;
  hand = 'left' as const;
  private warned = false;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.suction();
  }
  judge(t: Target): Verdict {
    return t.kind === 'aneurysm' && t.region !== 'neck' ? 'danger' : 'valid';
  }
  update(dt: number): void {
    const t = this.target;
    if (!this.pressed || !t) { this.warned = false; return; }
    bus.emit('suction', { point: t.point, dt });
    if (t.kind === 'aneurysm' && t.region !== 'neck') {
      addRuptureRisk(SIM.rupture.suctionOnDome * dt * (t.region === 'bleb' ? SIM.rupture.blebMultiplier : 1), 'suction-on-dome');
      if (!this.warned) { this.notice('nSuctionDome'); this.warned = true; }
    }
  }
}

/* ------------------------------------------------------------------ micro scissors */
/** Sharp dissection: cuts arachnoid and adhesion strands. Anything else it cuts, it injures. */
export class ScissorsTool extends Tool {
  readonly id = 'scissors' as const;
  private closing = 0;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.scissors();
  }
  choose(hits: Target[]) {
    return hits.find(h => h.kind !== 'clip') ?? null;
  }
  judge(t: Target): Verdict {
    if (t.kind === 'arachnoid' || t.kind === 'adhesion') return 'valid';
    if (t.kind === 'vessel' || t.kind === 'aneurysm' || t.kind === 'nerve') return 'danger';
    return 'invalid';
  }
  onDown(t: Target | null): void {
    this.closing = 0.2;
    if (!t) return;
    switch (t.kind) {
      case 'arachnoid':
        cutArachnoid(t.object.userData.segment as ArachnoidSegment, t.point);
        break;
      case 'adhesion': {
        const adh = t.object.userData.adhesion as Adhesion;
        freeAdhesion(adh);
        if (adh.group === 'dome') addRuptureRisk(0.04, 'cut-dome-adhesion');
        break;
      }
      case 'vessel':
        if (LARGE_VESSELS.has(t.structure)) {
          addInjury('arterial', t.structure, t.point, 1);
          this.notice('nCutLarge', 'alarm');
        } else {
          addInjury('ooze', t.structure, t.point, 0.3);
          this.notice('nCutSmall', 'warn');
        }
        break;
      case 'aneurysm':
        triggerRupture('scissors', t.point);
        break;
      case 'nerve':
        logEvent('nerve-injury', t.structure);
        this.notice('nNerveCut', 'alarm');
        break;
      case 'brain':
        addInjury('ooze', 'pia', t.point, 0.12);
        this.notice('nPiaCut', 'info');
        break;
    }
  }
  update(dt: number): void {
    this.closing = Math.max(0, this.closing - dt);
    this.instrument.setOpen(this.closing > 0 ? Math.abs(this.closing - 0.1) / 0.1 : 1);
  }
}

/* ------------------------------------------------------------------ bipolar */
/**
 * Bipolar coagulation: seals oozing points and small surface vessels on the brain. Hold it on the
 * spot for ~0.6 s. Never coagulate the PCom, the anterior choroidal artery or a major artery.
 */
export class BipolarTool extends Tool {
  readonly id = 'bipolar' as const;
  private hold = 0;
  private spot = new THREE.Vector3();
  private done = false;
  private glow: THREE.Mesh;
  private warnedDome = false;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.bipolar();
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.userData.noPick = true;
    this.instrument.group.add(this.glow);
  }
  judge(t: Target): Verdict {
    if (t.kind === 'brain' || t.kind === 'dura') return 'valid';
    return 'danger';
  }
  onDown(t: Target | null): void {
    this.hold = 0;
    this.done = false;
    if (t) this.spot.copy(t.point);
  }
  update(dt: number): void {
    const t = this.target;
    this.instrument.setOpen(this.pressed ? 0 : 1);
    const mat = this.glow.material as THREE.MeshBasicMaterial;
    mat.opacity = 0;
    if (!this.pressed || !t) { this.warnedDome = false; return; }
    if (t.point.distanceTo(this.spot) > 0.8) { this.spot.copy(t.point); this.hold = 0; this.done = false; }
    this.hold += dt;
    mat.opacity = 0.5 + 0.5 * Math.random();
    if (t.kind === 'aneurysm') {
      addRuptureRisk(SIM.rupture.bipolarOnDome * dt * (t.region === 'bleb' ? SIM.rupture.blebMultiplier : 1), 'bipolar-on-aneurysm');
      if (!this.warnedDome) { this.notice('nCoagDome', 'alarm'); this.warnedDome = true; }
      return;
    }
    if (this.done || this.hold < SIM.bipolar.coagTime) return;
    this.done = true;
    state.coagulations++;
    this.ctx.marks.add(t.object, t.faceIndex, t.point, t.kind === 'vessel' ? 0.6 : 1);
    bus.emit('coagulate', { point: t.point.clone(), structure: t.structure });
    // seal any bleeding point under the tips
    for (const inj of state.injuries) {
      if (inj.stopped || inj.point.distanceTo(t.point) > 1.8) continue;
      // an arterial tear can only be sealed once inflow is controlled (temporary clip)
      if (inj.kind === 'arterial' && (state.flow[inj.structure] ?? 1) > 0.5) {
        this.notice('nArterialNeedsControl', 'warn');
        continue;
      }
      inj.stopped = true;
      logEvent('haemostasis', inj.structure);
      this.notice('nOozeStopped', 'info');
    }
    if (t.kind === 'vessel') {
      logEvent('vessel-coagulated', t.structure);
      state.occluded.add(t.structure);
      this.notice(LARGE_VESSELS.has(t.structure) ? 'nCoagLarge' : 'nCoagSmallVessel', 'alarm');
    } else if (t.kind === 'nerve') {
      logEvent('nerve-injury', t.structure);
      this.notice('nCoagNerve', 'alarm');
    }
  }
}

/* ------------------------------------------------------------------ dissector */
/**
 * Blunt micro-dissection: drag the tip along adhesion strands to free the neck, or along the
 * arachnoid to open it bluntly. Dragging across the dome stresses it (hidden rupture risk).
 */
export class DissectorTool extends Tool {
  readonly id = 'dissector' as const;
  private warned = false;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.dissector();
  }
  choose(hits: Target[]) {
    return hits.find(h => h.kind !== 'clip') ?? null;
  }
  judge(t: Target): Verdict {
    if (t.kind === 'aneurysm') return t.region === 'neck' ? 'valid' : 'danger';
    if (t.kind === 'nerve') return 'danger';
    if (t.kind === 'dura' || t.kind === 'spatula') return 'invalid';
    return 'valid';
  }
  onDown(): void {
    this.warned = false;
  }
  onDrag(t: Target | null, _dx: number, _dy: number, mm: number): void {
    if (!t || mm <= 0) return;
    if (t.kind === 'adhesion') {
      const adh = t.object.userData.adhesion as Adhesion;
      adh.work -= mm;
      if (adh.group === 'dome') addRuptureRisk(0.012 * mm, 'dissect-dome-adhesion');
      if (adh.work <= 0) freeAdhesion(adh);
    } else if (t.kind === 'arachnoid') {
      const seg = t.object.userData.segment as ArachnoidSegment;
      seg.work -= mm;
      if (seg.work <= 0) cutArachnoid(seg, t.point);
    } else if (t.kind === 'aneurysm') {
      const k = t.region === 'bleb' ? SIM.rupture.blebMultiplier : t.region === 'neck' ? 0.15 : 1;
      addRuptureRisk(SIM.rupture.dissectorOnDome * mm * k, `dissector-on-${t.region}`);
      if (t.region !== 'neck' && !this.warned) { this.notice('nDissectDome'); this.warned = true; }
    }
  }
}

/* ------------------------------------------------------------------ spatula */
/**
 * Adjust retraction: drag a lobe away from the fissure (frontal up, temporal down). The fissure
 * only opens as far as the cut arachnoid allows; keep retraction modest.
 */
export class SpatulaTool extends Tool {
  readonly id = 'spatula' as const;
  private lobe: 'frontal' | 'temporal' | null = null;
  private warned = false;
  constructor(ctx: ToolContext) {
    super(ctx);
    this.instrument = I.spatula();
  }
  choose(hits: Target[]) {
    return hits.find(h => h.kind !== 'arachnoid' && h.kind !== 'adhesion') ?? null;
  }
  judge(t: Target): Verdict {
    if (t.kind === 'spatula' || t.kind === 'cottonoid') return 'valid';
    if (t.kind === 'brain' && (t.structure === 'frontal' || t.structure === 'temporal')) return 'valid';
    return 'invalid';
  }
  onDown(t: Target | null): void {
    this.warned = false;
    this.lobe = null;
    if (!t || this.judge(t) !== 'valid') return;
    this.lobe = t.structure === 'temporal' ? 'temporal' : 'frontal';
  }
  onDrag(_t: Target | null, _dx: number, dy: number): void {
    if (!this.lobe) return;
    const delta = (this.lobe === 'frontal' ? -dy : dy) * SIM.retraction.dragPerPx;
    const ok = requestOpening(state.retraction.opening + delta);
    if (!ok && !this.warned) { this.notice('nRetractionLimited', 'info'); this.warned = true; }
  }
}
