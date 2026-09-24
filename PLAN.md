# IC-PC Aneurysm Clipping Simulator — Plan

> Educational / demonstration software only. Not clinical training, not medical advice.
> This disclaimer appears on the start screen and in the README.

## 1. Goal

A browser-only simulator of microsurgical clipping of a **right IC-PC aneurysm** through a
**right pterional, transsylvian approach**, rendered as if seen through an operating microscope.
Built in six runnable milestones (M1–M6).

## 2. Stack

| Concern | Choice |
|---|---|
| Build | Vite + TypeScript (strict) |
| 3D | Three.js |
| Microscope look | `postprocessing` (pmndrs): DepthOfField, Bloom, Vignette, ACES tone mapping, warm key light + coaxial "scope" light that follows the camera |
| Audio | Web Audio API, fully synthesized (no audio files) |
| State | In-memory store + typed event bus. No backend, no persistence |
| Tests | Vitest for pure logic (flow model, clip evaluation, stage goals, vitals); Playwright smoke test (page loads, no console errors, screenshot) using the preinstalled Chromium |

## 3. Code layout

```
src/
  main.ts                 bootstrap, start screen → sim loop
  config/anatomy.ts       ALL anatomy sizes/positions/colors in one place (tunable)
  config/sim.ts           tuning for vitals, bleeding, rupture risk, timers
  core/                   event bus, store, game loop, clock
  scene/                  renderer, microscope camera + controls, lighting, postprocessing, PiP
  anatomy/                procedural builders: lobes, arachnoid, vessels, nerves, aneurysm, spatulas
  tools/                  one file per tool + ToolManager (cursor model, hover, rules)
  procedure/              stage definitions, goal predicates, demo-mode scripts
  physics/                flow network, clip geometry/evaluation, rupture risk, blood particles + pool
  audio/                  Doppler synth, ECG beep, alarms
  ui/                     start screen, toolbar, checklist, mentor, vitals + ECG canvas, debrief, i18n (en/ja)
```

## 4. Units, frame, and anatomy model

- **1 scene unit = 1 mm.** The aneurysm is 6.6 mm in diameter.
- **Surgical view**: patient supine, head rotated ~30° to the left and extended, so the
  microscope looks down the right sylvian fissure. On screen: **frontal lobe top, temporal lobe
  bottom, midline (optic nerve) to the left, ICA deep in the centre**.
- **Vessels** are `TubeGeometry` along Catmull-Rom splines, defined as control points + radius in
  `config/anatomy.ts`, and linked into a **vessel graph** (node = branch point) used by the flow model:
  - ICA (supraclinoid, ~4 mm) → bifurcation into **M1** (lateral, ~3 mm) and **A1** (medial, ~2 mm)
  - **M1 → M2** superior/inferior trunks running out along the fissure
  - **PCom** from the posterior wall of the ICA, running posteromedially (~1.2 mm)
  - **Anterior choroidal artery** from the ICA just distal to the PCom, running posterolaterally (~0.8 mm)
- **Aneurysm**: sphere-ish sac (deformed icosphere) with a defined neck ring at the IC-PC junction,
  projecting **posterolaterally and downward** toward the tentorial edge / oculomotor nerve,
  with a small **bleb** on the dome (the weakest point; handling it raises rupture risk the most).
- **Nerves**: optic nerve (medial, entering the optic canal), oculomotor nerve (deep, lateral to the PCom).
- **Lobes**: displaced, noise-perturbed ellipsoids with a gyral normal map; sylvian fissure between.
- **Arachnoid**: several semi-transparent membrane patches (sylvian, carotid, chiasmatic cisterns),
  each split into cuttable segments.
- **Spatulas**: retractor blade meshes holding frontal and temporal lobes apart; adjustable with the spatula tool.
- **Materials**: `MeshPhysicalMaterial` with clearcoat for the wet look; vertex-shader pulsation
  driven by a shared `heartPhase` uniform (arteries pulse most, brain barely).
- Learner-facing anatomy comments in `config/anatomy.ts` and `anatomy/*` explain each structure
  and why it matters in this approach.

## 5. Interaction

**Microscope camera** (left mouse is reserved for tools):
- Wheel: magnification (zoom), right-drag: pan the field, middle-drag or Alt+left-drag: tilt/orbit
  within a limited cone, F: auto-focus on the point under the cursor (DoF focal distance follows).

**Tools** (bottom toolbar, keys `1`–`0`). Each has a cursor model, a hover highlight on valid targets,
and a rule set:

| Key | Tool | Rule |
|---|---|---|
| 1 | Suction | Hold to lower pool level / remove blood particles near tip |
| 2 | Micro scissors | Click an arachnoid segment to cut it; cutting a vessel causes bleeding |
| 3 | Bipolar | Hold on an ooze point to coagulate; on a major artery = injury |
| 4 | Dissector | Drag along the neck to free adhesions; drag force on the dome raises rupture risk |
| 5 | Spatula | Drag to adjust retraction; excessive retraction is scored |
| 6 | Aneurysm clip | Position on surface, `Q/E` rotate, `W/S` blade depth, `C` straight/curved, click to apply, `X` remove |
| 7 | ICG | Toggle fluorescence view; filling follows the flow model in arterial time order |
| 8 | Micro Doppler | Touch a vessel: pulsatile tone scaled by flow; silence if occluded |
| 9 | Endoscope | Toggle picture-in-picture view from behind the aneurysm |
| 0 | Temporary clip | Click proximal ICA: flow ↓, bleeding ↓, occlusion timer starts; click again to release |

## 6. Simulation model

- **Flow network**: each vessel segment has a patency 0–1. Clips are capsules; intersection with a
  vessel's centreline gives a stenosis fraction. Flow propagates from the ICA through the graph.
  Aneurysm sac filling = fraction of neck left open by the clip.
- **Clip evaluation** (geometric): neck closure %, residual neck (mm), ICA stenosis %, PCom and
  AChA patency. Results are *shown* through ICG filling and Doppler tone, plus a summary card.
- **Rupture risk**: hidden accumulator raised by dissector force on the dome/bleb, clip placement on
  the dome, excessive retraction, and high BP. Above a stochastic threshold → intraoperative rupture.
- **Bleeding**: point sources (ooze = slow, bipolar-stoppable; rupture = fast arterial jet, pressure
  scaled by BP and temporary clip). GPU `Points` particle system + a translucent **pool plane**
  that rises with un-suctioned volume and obscures the field.
- **Vitals**: simple physiology — baseline HR ~70, BP ~120/70, SpO2 ~99 with slow random drift;
  blood loss → BP ↓ / HR ↑; temporary occlusion > ~10 min → MEP falls (sooner with low BP);
  ECG waveform drawn on a canvas and `heartPhase` drives pulsation and Doppler.

## 7. Procedure stages

A stage = localized title, mentor text, sub-tasks, and goal predicates over sim state.
Next stage unlocks when all goals are true.

1. **Open the sylvian fissure** — cut the sylvian arachnoid segments; place spatulas.
2. **Identify M1** — hover/Doppler M1.
3. **Identify the ICA and optic nerve** — open the carotid cistern; identify both.
4. **Confirm PCom and dissect the neck** — identify PCom and AChA; free proximal and distal neck.
5. **Clip the aneurysm** — optional temp clip; apply definitive clip.
6. **Confirm PCom patency** — Doppler PCom/AChA, run ICG, reposition if needed → debrief.

**Demo mode**: each stage has a scripted sequence (tool, target, timing) that drives the same
tool APIs a user would. Any click or tool key hands control back to the user from the current state.

## 8. UI

- Dark, minimal, semi-transparent panels, 1px borders, monospace numerals.
- Top right vitals; left checklist; bottom toolbar; bottom right collapsible mentor panel (sub-task
  checkboxes, progress %); top bar EN/日本語 toggle. All strings through a single `i18n` dictionary.
- Start screen: title, disclaimer, language toggle, Start / Demo buttons, controls cheat sheet.
- Debrief: total time, blood loss, temp occlusion time, rupture yes/no, clip result, 2–4
  specific tips generated from the recorded events.

## 9. Milestones

| | Deliverable | How you test it |
|---|---|---|
| M1 | Vite scaffold, microscope camera + controls, postprocessing, all basic anatomy from config, start screen with disclaimer | Zoom/pan/tilt around the field; tune `config/anatomy.ts` |
| M2 | Toolbar, 10 tools with cursors/hover, arachnoid cutting, suction/bipolar/dissector/spatula basics | Switch tools with 1–0, cut membranes |
| M3 | Stage engine, checklist, mentor panel, i18n | Complete stages 1–4 by hand, toggle language |
| M4 | Vitals + ECG, bleeding particles, pool, rupture risk, temp clip timer, alarms | Provoke bleeding / rupture, watch vitals react |
| M5 | Clip placement + evaluation, flow network, ICG view, Doppler audio, endoscope PiP | Clip well and badly; verify with ICG/Doppler/endoscope |
| M6 | Debrief, demo mode with takeover, polish, perf pass | Run demo, take over mid-stage, finish, read debrief |

After each milestone: `npm run build` + tests + dev-server smoke test (headless Chromium,
console-error check, screenshot), then a short "what to test" note.

## 10. Known simplifications

- Procedural, stylized anatomy — proportions follow typical adult values but it is not patient-specific.
- No soft-body physics; tissue deformation is limited to retraction offsets and shader pulsation.
- Physiology and rupture models are illustrative, not validated.

## 11. Questions for you (defaults in bold, I'll proceed with these if you just approve)

1. Default language on first load: **English** (or Japanese)?
2. Visual target for M1: **stylized-realistic procedural** (no external 3D models/textures), OK?
3. Mouse mapping: **left = tool, right = pan, wheel = zoom, middle/Alt = tilt**, OK?
