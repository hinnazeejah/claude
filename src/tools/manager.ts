import * as THREE from 'three';
import type { OutlineEffect } from 'postprocessing';
import { Picker, type Target } from './picking';
import type { Tool, ToolContext, Verdict } from './tool';
import { SuctionTool, ScissorsTool, BipolarTool, DissectorTool, SpatulaTool } from './basicTools';
import { ClipTool, TempClipTool } from './clipTools';
import { IcgTool, DopplerTool, EndoscopeTool } from './imagingTools';
import { bus } from '../core/events';
import { state, type ToolId } from '../core/state';

/** Keyboard order of the toolbar: keys 1–9, 0. */
export const TOOL_ORDER: ToolId[] = [
  'suction', 'scissors', 'bipolar', 'dissector', 'spatula', 'clip', 'icg', 'doppler', 'endoscope', 'tempClip',
];

const OUTLINE: Record<Verdict, string | null> = { valid: '#5fe0b8', danger: '#ffae42', invalid: null };

/**
 * Owns the tools: raycasts once per frame, lets the active tool choose its target, outlines it,
 * seats the instrument and routes mouse/keyboard input. Left button = tool; right/middle belong
 * to the microscope controls.
 */
export class ToolManager {
  tools: Record<ToolId, Tool>;
  active: Tool;
  private picker: Picker;
  private mouse = { x: 0, y: 0, inside: false };
  private down: { x: number; y: number } | null = null;
  private hoverKey: string | null = null;
  private outlined: THREE.Object3D | null = null;
  enabled = true;

  constructor(private ctx: ToolContext, private dom: HTMLElement, private outline: OutlineEffect) {
    this.picker = new Picker(ctx.camera, ctx.anatomy.root, ctx.anatomy.aneurysmShape);
    this.tools = {
      suction: new SuctionTool(ctx),
      scissors: new ScissorsTool(ctx),
      bipolar: new BipolarTool(ctx),
      dissector: new DissectorTool(ctx),
      spatula: new SpatulaTool(ctx),
      clip: new ClipTool(ctx),
      icg: new IcgTool(ctx),
      doppler: new DopplerTool(ctx),
      endoscope: new EndoscopeTool(ctx),
      tempClip: new TempClipTool(ctx),
    };
    for (const t of Object.values(this.tools)) {
      t.instrument.group.visible = false;
      t.instrument.group.traverse(o => (o.userData.noPick = true));
      ctx.scene.add(t.instrument.group);
    }
    this.active = this.tools[state.tool];

    dom.addEventListener('pointermove', e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
      if (this.down && this.enabled) {
        const dx = e.clientX - this.down.x, dy = e.clientY - this.down.y;
        this.down = { x: e.clientX, y: e.clientY };
        this.pickNow();
        this.active.onDrag(this.active.target, dx, dy, Math.hypot(dx, dy) * ctx.mmPerPx());
      }
    });
    dom.addEventListener('pointerleave', () => (this.mouse.inside = false));
    dom.addEventListener('pointerdown', e => {
      if (!this.enabled || e.button !== 0 || e.altKey) return;
      this.down = { x: e.clientX, y: e.clientY };
      this.pickNow();
      this.active.pressed = true;
      this.active.onDown(this.active.target);
    });
    window.addEventListener('pointerup', e => {
      if (e.button !== 0 || !this.down) return;
      this.down = null;
      this.active.pressed = false;
      this.active.onUp();
    });
    window.addEventListener('keydown', e => this.onKey(e));
  }

  select(id: ToolId): void {
    if (this.active.id === id) return;
    this.active.pressed = false;
    this.active.deactivate();
    this.active.instrument.group.visible = false;
    this.active = this.tools[id];
    state.tool = id;
    this.active.activate();
    bus.emit('tool:select', id);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.enabled || e.repeat && !'qeadws'.includes(e.key.toLowerCase())) return;
    if (/^[0-9]$/.test(e.key)) {
      const i = e.key === '0' ? 9 : Number(e.key) - 1;
      this.select(TOOL_ORDER[i]);
      return;
    }
    this.active.onKey(e);
  }

  private pickNow(): void {
    if (!this.mouse.inside) { this.active.target = null; return; }
    const hits = this.picker.pick(this.mouse.x, this.mouse.y, this.dom.clientWidth, this.dom.clientHeight);
    this.active.target = this.active.choose(hits);
  }

  private setOutline(obj: THREE.Object3D | null, color: string | null): void {
    if (obj === this.outlined && !color === !obj) {
      if (color) this.outline.visibleEdgeColor.set(color);
      return;
    }
    this.outlined = obj;
    const sel = this.outline.selection;
    sel.clear();
    if (obj && color) {
      obj.traverse(o => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material && ((o as THREE.Mesh).material as THREE.Material).visible !== false) sel.add(o); });
      this.outline.visibleEdgeColor.set(color);
      this.outline.hiddenEdgeColor.set(color).multiplyScalar(0.35);
    }
  }

  update(dt: number): void {
    const tool = this.active;
    if (!this.down) this.pickNow();
    const t = tool.target;
    const inst = tool.instrument.group;
    if (!this.enabled || !t) {
      inst.visible = false;
      this.setOutline(null, null);
      this.emitHover(null);
      this.dom.style.cursor = 'crosshair';
      tool.update(dt);
      return;
    }
    const verdict = tool.judge(t);
    this.setOutline(tool.outlineOf(t), OUTLINE[verdict]);
    this.emitHover(t);
    // instrument enters from the microscope side, from the holding hand's side of the field
    const cam = this.ctx.camera;
    const F = new THREE.Vector3(); cam.getWorldDirection(F);
    const R = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const U = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const side = tool.hand === 'right' ? 1 : -1;
    const shaft = F.clone().negate().addScaledVector(R, 0.42 * side).addScaledVector(U, -0.3).normalize();
    inst.visible = true;
    tool.seat(t, shaft, R);
    this.dom.style.cursor = 'none';
    tool.update(dt);
  }

  private emitHover(t: Target | null): void {
    const key = t ? (t.kind === 'aneurysm' ? t.region! : t.kind === 'arachnoid' ? 'arachnoid' : t.kind === 'adhesion' ? 'adhesion' : t.kind === 'clip' ? 'clip' : t.kind === 'spatula' || t.kind === 'cottonoid' ? t.kind : t.structure) : null;
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      bus.emit('hover:structure', key);
    }
  }
}
