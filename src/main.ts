import * as THREE from 'three';
import './ui/styles.css';
import { View } from './scene/renderer';
import { MicroscopeControls } from './scene/microscope';
import { ScopeLight } from './scene/lighting';
import { AnatomyLabels } from './scene/labels';
import { buildAnatomy, type Anatomy } from './anatomy';
import { sharedUniforms } from './anatomy/shaders';
import { SimClock } from './core/clock';
import { bus } from './core/events';
import { showStartScreen } from './ui/startScreen';
import { buildHud, toast } from './ui/hud';
import { t } from './ui/i18n';

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
let openingGoal = 0;

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
    openingGoal = a.opening;
    view.scene.add(a.root);
    view.noAO.push(a.arachnoidGroup);
    start.setStatus('');
    start.ready();
  })
  .catch(err => {
    console.error(err);
    start.setStatus(`Failed to load anatomy: ${err.message}`);
  });

bus.on('start', ({ demo }) => {
  buildHud(hudHost, { opening: anatomy?.opening ?? 0 });
  if (demo) toast(hudHost, t('demoSoon'), 3500);
});
bus.on('anatomy:opening', v => (openingGoal = v));

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'l') bus.emit('view:labels', !labels.visible);
  if (k === 'p') bus.emit('anatomy:opening', Math.min(1, openingGoal + 0.1));
  if (k === 'o') bus.emit('anatomy:opening', Math.max(0, openingGoal - 0.1));
});

function frame() {
  const dt = clock.tick();
  sharedUniforms.uHeartPhase.value = clock.heartPhase;
  sharedUniforms.uTime.value = clock.time;
  if (anatomy && Math.abs(anatomy.opening - openingGoal) > 1e-3) {
    anatomy.setOpening(anatomy.opening + (openingGoal - anatomy.opening) * Math.min(1, dt * 6));
  }
  controls.update(dt);
  light.update(view.camera, controls.target);
  view.dof.target!.copy(controls.target);
  view.render(dt);
  labels.render(view.scene, view.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for tests and the console.
Object.assign(window, { __sim: { view, controls, clock, get anatomy() { return anatomy; } } });
