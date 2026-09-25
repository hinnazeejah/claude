import * as THREE from 'three';
import './ui/styles.css';
import { View } from './scene/renderer';
import { MicroscopeControls } from './scene/microscope';
import { ScopeLight } from './scene/lighting';
import { AnatomyLabels } from './scene/labels';
import { IcgView } from './scene/icg';
import { EndoscopeView } from './scene/endoscope';
import { buildAnatomy, type Anatomy } from './anatomy';
import { sharedUniforms } from './anatomy/shaders';
import { SimClock } from './core/clock';
import { ANATOMY } from './config/anatomy';
import { SIM } from './config/sim';
import { bus } from './core/events';
import { state } from './core/state';
import { updateTweens } from './core/tween';
import { showStartScreen } from './ui/startScreen';
import { buildHud } from './ui/hud';
import { t } from './ui/i18n';
import { buildToolbar, buildNotices } from './ui/toolbar';
import { buildChecklist, buildMentor } from './ui/procedurePanels';
import { VitalsPanel } from './ui/vitals';
import { showDebrief } from './ui/debrief';
import { ToolManager } from './tools/manager';
import { Marks } from './tools/marks';
import { initTissueState, requestOpening } from './tools/tissue';
import { ProcedureEngine } from './procedure/engine';
import { DemoDirector } from './procedure/demo';
import { Vitals } from './physics/vitals';
import { Bleeding } from './physics/bleeding';
import { computeFlow } from './physics/flow';
import { evaluateClips, NO_CLIP } from './physics/clipEval';
import { buildEvalGeometry } from './physics/geometry';
import { audio } from './audio/audio';

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
let procedure: ProcedureEngine | null = null;
let bleeding: Bleeding | null = null;
let icg: IcgView | null = null;
let endoscope: EndoscopeView | null = null;
let demo: DemoDirector | null = null;
let vitalsPanel: VitalsPanel | null = null;
const vitals = new Vitals();
const marks = new Marks();
view.scene.add(marks.group);
const evalGeom = buildEvalGeometry();
let started = false;
let startTime = 0;
let debriefOpen = false;

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
    bleeding = new Bleeding(a.aneurysmShape);
    view.scene.add(bleeding.group);
    view.noAO.push(a.arachnoidGroup, marks.group, bleeding.group);
    const seat = a.retraction.onApplied;
    a.retraction.onApplied = () => { seat?.(); marks.update(); };
    initTissueState(a);
    icg = new IcgView(view.scene);
    endoscope = new EndoscopeView(view.scene, a.aneurysmShape, hudHost);
    tools = new ToolManager({
      anatomy: a, camera: view.camera, scene: view.scene, marks,
      mmPerPx: () => (2 * ANATOMY.microscope.workingDistance * Math.tan(THREE.MathUtils.degToRad(view.camera.fov / 2))) / canvas.clientHeight,
      services: { icg, endoscope, doppler: f => audio.setDoppler(f) },
    }, canvas, view.outline);
    tools.enabled = false;
    demo = new DemoDirector(a, tools, controls);
    start.setStatus('');
    start.ready();
  })
  .catch(err => {
    console.error(err);
    start.setStatus(`Failed to load anatomy: ${err.message}`);
  });

function openDebrief() {
  if (debriefOpen) return;
  demo?.stop();
  debriefOpen = true;
  if (tools) tools.enabled = false;
  showDebrief(hudHost, state.time - startTime, () => {
    debriefOpen = false;
    if (tools) tools.enabled = true;
  });
}

bus.on('start', ({ demo: demoMode }) => {
  audio.start();
  buildHud(hudHost, {
    opening: anatomy?.opening ?? 0,
    magnification: controls.magnification,
    onEnd: openDebrief,
    onMute: () => { audio.setMuted(!audio.muted); return audio.muted; },
  });
  buildToolbar(hudHost, id => tools?.select(id));
  buildNotices(hudHost);
  procedure = new ProcedureEngine();
  buildChecklist(hudHost, procedure);
  buildMentor(hudHost, procedure);
  vitalsPanel = new VitalsPanel(hudHost, vitals);
  if (tools) tools.enabled = true;
  started = true;
  startTime = state.time;
  if (demoMode) {
    bus.emit('notice', { key: 'demoTakeover', level: 'info' });
    void demo?.run();
  }
});

// clip result is recomputed whenever the clips change
const reevaluate = () => (state.clipResult = state.clips.length ? evaluateClips(state.clips, evalGeom) : null);
bus.on('clip:applied', reevaluate);
bus.on('clip:removed', reevaluate);

bus.on('anatomy:opening', v => (state.retraction.opening = Math.min(v, state.retraction.allowed)));
bus.on('identified', k => {
  bus.emit('notice', { key: 'identifiedPrefix', level: 'info', arg: `a.${k}` });
  audio.chime();
});
bus.on('stage:changed', () => audio.chime());
bus.on('rupture', () => bus.emit('notice', { key: 'nRupture', level: 'alarm' }));
bus.on('adhesion:freed', ({ group, remaining }) => {
  if (remaining === 0 && group !== 'dome') bus.emit('notice', { key: group === 'proximalNeck' ? 'nProximalFreed' : 'nDistalFreed', level: 'info' });
});
const badge = document.createElement('div');
badge.className = 'icgbadge panel';
badge.style.display = 'none';
hudHost.appendChild(badge);
bus.on('icg:toggle', on => (badge.style.display = on ? '' : 'none'));

window.addEventListener('keydown', e => {
  if (demo?.running || debriefOpen) return;
  const k = e.key.toLowerCase();
  if (k === 'l') bus.emit('view:labels', !labels.visible);
  if (k === 'p' && !requestOpening(state.retraction.opening + 0.1)) bus.emit('notice', { key: 'nRetractionLimited', level: 'info' });
  if (k === 'o') requestOpening(state.retraction.opening - 0.1);
  if (k === 'v') audio.setMuted(!audio.muted);
});

let warnedRetraction = false;
let warnedOcclusion = false;
const activeAlarms = new Set<string>();
let lastBeat = 0;

function updatePhysiology(dt: number) {
  if (!anatomy || !bleeding) return;
  const flow = computeFlow({ tempClip: state.tempClip.applied, clip: state.clipResult ?? NO_CLIP, occluded: state.occluded });
  state.flow = flow;
  bleeding.update(dt, vitals.map, flow, clock.heartPhase, view.camera, canvas.clientHeight);
  const occ = state.tempClip.applied ? state.time - state.tempClip.since : 0;
  vitals.update(dt, { bleedRate: bleeding.rate, tempClipSeconds: occ, achaFlow: flow.acha, icaFlow: flow.ica });
  clock.heartRate = vitals.hr;
  const v = state.vitals;
  v.map = vitals.map; v.ebl = vitals.ebl; v.mep = vitals.mep; v.bleedRate = bleeding.rate;
  v.minMap = Math.min(v.minMap, vitals.map);
  v.minMep = Math.min(v.minMep, vitals.mep);

  // retraction and occlusion warnings
  const r = state.retraction;
  r.max = Math.max(r.max, r.opening);
  if (r.opening > SIM.retraction.excessive) {
    r.excessiveSeconds += dt;
    if (!warnedRetraction && r.excessiveSeconds > 20) { warnedRetraction = true; bus.emit('notice', { key: 'nExcessiveRetraction', level: 'warn' }); }
  } else warnedRetraction = false;
  if (occ > SIM.vitals.safeOcclusionS && !warnedOcclusion) { warnedOcclusion = true; bus.emit('notice', { key: 'nOcclusionLong', level: 'warn' }); }
  if (!state.tempClip.applied) warnedOcclusion = false;

  // monitor sounds and alarms
  const beat = Math.floor(clock.heartPhase);
  if (beat !== lastBeat) { lastBeat = beat; audio.beat(vitals.spo2); }
  const alarms = vitals.alarms();
  if (bleeding.rate > 1) alarms.push({ key: 'nRupture', level: 'alarm' });
  for (const a of alarms) if (!activeAlarms.has(a.key) && a.key !== 'nRupture') bus.emit('notice', { key: a.key, level: a.level });
  activeAlarms.clear();
  alarms.forEach(a => activeAlarms.add(a.key));
  audio.alarm(alarms.some(a => a.level === 'alarm') ? 'alarm' : alarms.length ? 'warn' : null, state.time);
  audio.update(clock.heartPhase);
  icg?.update(dt, flow);
  vitalsPanel?.update(dt, clock.heartPhase, state.time - startTime);
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
  controls.update(dt);
  tools?.update(dt);
  if (started && !debriefOpen) {
    procedure?.update(dt);
    updatePhysiology(dt);
  }
  badge.textContent = icg?.active ? `${t('icgBadge')} · ${icg.t.toFixed(1)} s` : '';
  light.update(view.camera, controls.target);
  view.dof.target!.copy(controls.target);
  view.render(dt);
  endoscope?.render(view.renderer, view.scene);
  labels.render(view.scene, view.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for tests and the console.
Object.assign(window, {
  __sim: {
    view, controls, clock, state, vitals, audio,
    get anatomy() { return anatomy; }, get tools() { return tools; }, get procedure() { return procedure; },
    get bleeding() { return bleeding; }, get demo() { return demo; }, get icg() { return icg; }, get endoscope() { return endoscope; },
  },
});
