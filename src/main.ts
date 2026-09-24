import * as THREE from 'three';
import './ui/styles.css';
import { View } from './scene/renderer';
import { MicroscopeControls } from './scene/microscope';
import { ScopeLight } from './scene/lighting';
import { AnatomyLabels } from './scene/labels';
import { buildAnatomy, type Anatomy } from './anatomy';
import { sharedUniforms } from './anatomy/shaders';
import { SimClock } from './core/clock';
import { ANATOMY } from './config/anatomy';
import { bus } from './core/events';
import { showStartScreen } from './ui/startScreen';
import { buildHud, toast } from './ui/hud';
import { t } from './ui/i18n';
import { buildToolbar, buildNotices } from './ui/toolbar';
import { ToolManager } from './tools/manager';
import { Marks } from './tools/marks';
import { initTissueState, requestOpening } from './tools/tissue';
import { state } from './core/state';
import { updateTweens } from './core/tween';
import { SIM } from './config/sim';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hudHost = document.getElementById('hud')!;
const labelHost = document.getElementById('labels')!;

const view = new View(canvas);
const controls = new MicroscopeControls(view.camera, canvas);
const light = new ScopeLight(view.scene);
const labels = new AnatomyLabels(view.scene, labelHost);
const clock = new SimClock();
const start = showStartScreen(hudHost);
start.setStatus('Loading anatomy…');

let anatomy: Anatomy | null = null;
let tools: ToolManager | null = null;
const marks = new Marks();
view.scene.add(marks.group);

const raycaster = new THREE.Raycaster();
function pickPoint(x: number, y: number): THREE.Vector3 | null {
  if (!anatomy) return null;
  const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, view.camera);
  const hits = raycaster.intersectObject(anatomy.root, true).filter(h => h.object.visible && h.object.userData.kind !== 'arachnoid');
  return hits[0]?.point ?? null;
}
controls.pick = pickPoint;

buildAnatomy(`${import.meta.env.BASE_URL}models/anatomy.glb`)
  .then(a => {
    anatomy = a;
    state.retraction.opening = a.opening;
    view.scene.add(a.root);
    view.noAO.push(a.arachnoidGroup, marks.group);
    const seat = a.retraction.onApplied;
    a.retraction.onApplied = () => { seat?.(); marks.update(); };
    initTissueState(a);
    tools = new ToolManager({
      anatomy: a, camera: view.camera, scene: view.scene, marks,
      mmPerPx: () => (2 * ANATOMY.microscope.workingDistance * Math.tan(THREE.MathUtils.degToRad(view.camera.fov / 2))) / canvas.clientHeight,
    }, canvas, view.outline);
    tools.enabled = false;
    start.setStatus('');
    start.ready();
  })
  .catch(err => {
    console.error(err);
    start.setStatus(`Failed to load anatomy: ${err.message}`);
  });

bus.on('start', ({ demo }) => {
  buildHud(hudHost, { opening: anatomy?.opening ?? 0, magnification: controls.magnification });
  buildToolbar(hudHost, id => tools?.select(id));
  buildNotices(hudHost);
  if (tools) tools.enabled = true;
  if (demo) toast(hudHost, t('demoSoon'), 3500);
});
bus.on('anatomy:opening', v => (state.retraction.opening = Math.min(v, state.retraction.allowed)));
bus.on('rupture', () => bus.emit('notice', { key: 'nRupture', level: 'alarm' }));
bus.on('adhesion:freed', ({ group, remaining }) => {
  if (remaining === 0 && group !== 'dome') bus.emit('notice', { key: group === 'proximalNeck' ? 'nProximalFreed' : 'nDistalFreed', level: 'info' });
});

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'l') bus.emit('view:labels', !labels.visible);
  if (k === 'p' && !requestOpening(state.retraction.opening + 0.1)) bus.emit('notice', { key: 'nRetractionLimited', level: 'info' });
  if (k === 'o') requestOpening(state.retraction.opening - 0.1);
});

let warnedRetraction = false;
function updateRetractionStats(dt: number) {
  const r = state.retraction;
  r.max = Math.max(r.max, r.opening);
  if (r.opening > SIM.retraction.excessive) {
    r.excessiveSeconds += dt;
    if (!warnedRetraction && r.excessiveSeconds > 20) { warnedRetraction = true; bus.emit('notice', { key: 'nExcessiveRetraction', level: 'warn' }); }
  } else warnedRetraction = false;
}

function frame() {
  const dt = clock.tick();
  state.time = clock.time;
  sharedUniforms.uHeartPhase.value = clock.heartPhase;
  sharedUniforms.uTime.value = clock.time;
  const goal = state.retraction.opening;
  if (anatomy && Math.abs(anatomy.opening - goal) > 1e-3) {
    anatomy.setOpening(Math.abs(anatomy.opening - goal) < 0.004 ? goal : anatomy.opening + (goal - anatomy.opening) * Math.min(1, dt * 6));
  }
  updateTweens(dt);
  updateRetractionStats(dt);
  controls.update(dt);
  tools?.update(dt);
  light.update(view.camera, controls.target);
  view.dof.target!.copy(controls.target);
  view.render(dt);
  labels.render(view.scene, view.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for tests and the console.
Object.assign(window, { __sim: { view, controls, clock, state, get anatomy() { return anatomy; }, get tools() { return tools; } } });
