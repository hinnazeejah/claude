# IC-PC Aneurysm Clipping Simulator

Browser-based educational simulator of microsurgical clipping of a **right internal carotid –
posterior communicating artery (IC-PC) aneurysm** through a **pterional, transsylvian approach**,
rendered as if seen through an operating microscope.

> **Educational demonstration only.** Not a clinical training device, not validated, and not
> medical advice. Anatomy and physiology are simplified.

## Run

Requires **Node.js 22.12+** (`nvm use` picks it up from `.nvmrc`). If `npm run dev` fails with
"Cannot find native binding", delete `node_modules` and `package-lock.json` and run `npm install` again.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # type-check + production build
npm run smoke      # headless Chromium smoke test → ./screenshots
```

## Controls

| Input | Action |
|---|---|
| Mouse wheel / `+` `-` | Magnification |
| Right drag / arrow keys | Move the field |
| Middle drag / Alt + drag | Tilt the microscope |
| `F` | Focus on the structure under the cursor |
| `R` | Reset view |
| `L` | Anatomy labels |
| `O` / `P` | Close / open the sylvian fissure (limited by uncut arachnoid) |
| `1`–`0` | Select tool (toolbar at the bottom) |
| `M` | Collapse / expand the mentor |
| `V` | Sound on / off |
| **End** (top bar) | Finish and open the debrief |
| Left button | Use the tool (click, hold or drag depending on the tool) |

### Tools

| Key | Tool | Rule |
|---|---|---|
| 1 | Suction | Hold with the tip in blood to clear the pool and droplets. On the dome it raises the hidden rupture risk. |
| 2 | Micro scissors | Click arachnoid segments or adhesion strands to cut. Cutting vessels, nerves or the aneurysm injures them. |
| 3 | Bipolar | Hold ~0.6 s to coagulate: seals oozing points; coagulating PCom / AChA / major arteries / nerves is penalised. |
| 4 | Dissector | Drag along adhesion strands to free the proximal and distal neck; drag on arachnoid to open it bluntly. Dome/bleb contact raises rupture risk. |
| 5 | Spatula | Drag the frontal lobe up / temporal lobe down to open the fissure (only as far as the cut arachnoid allows). |
| 6 | Aneurysm clip | Ghost clip at the cursor: `Q/E` roll, `A/D` tilt, `W/S` blade depth, `C` straight/curved, click to apply, `X` remove last. |
| 7 | ICG | Click to inject: near-infrared view in which vessels fill in arterial order; an excluded sac stays dark, a trapped branch never fills. |
| 8 | Micro Doppler | Hold on a vessel: pulsatile whoosh proportional to flow, silence when occluded. |
| 9 | Endoscope | Click to toggle a picture-in-picture view from behind the aneurysm (PCom, AChA, back of the clip). |
| 0 | Temporary clip | Click the proximal ICA to apply (occlusion timer starts), click the clip to release. |

### Procedure (M3)

The left panel lists the six stages; the mentor (bottom right, `M` to collapse) shows calm
guidance, sub-task checkboxes and overall progress. Each stage unlocks the next when its required
sub-tasks are done. **Identify** a structure by resting the cursor on it for ~1 s with any tool
(it works through transparent arachnoid). Stage definitions live in `src/procedure/stages.ts`.

### Physiology, bleeding and evaluation (M4–M5)

- **Vitals** (top right): sweeping ECG and arterial traces, HR, ABP, SpO₂, MEP, operating time,
  temporary-occlusion timer, blood loss and bleeding rate, with alarm colours and tones. Blood
  loss lowers pressure and raises heart rate; temporary occlusion beyond 5 min, hypotension or a
  lost anterior choroidal artery lower MEP (`src/physics/vitals.ts`).
- **Bleeding**: oozing points (bipolar seals them), arterial tears (sealable only once inflow is
  controlled) and intraoperative rupture, whose rate scales with pressure and inflow. Droplets
  show the source; unsuctioned blood pools and floods the deep field. A temporary clip slows a
  rupture; a clip that seals the neck stops it (`src/physics/bleeding.ts`).
- **Clip evaluation** is geometric (`src/physics/clipEval.ts`): neck closure, residual neck, ICA
  narrowing and PCom / AChA entrapment feed the **flow model** (`src/physics/flow.ts`), which is
  what ICG, Doppler, vitals and the debrief show.

### Debrief and demo mode (M6)

- **End** opens the debrief: time, blood loss, temporary occlusion, rupture, lowest MEP, clip
  result and up to five specific tips generated from what happened.
- **Demo mode** (start screen) performs the whole operation with the real tools; click or press
  any key to take over from exactly where it is.

Add `?quality=low` to the URL on weak GPUs (disables MSAA and ambient occlusion).

## Tuning the anatomy

Every size, position and colour is in [`src/config/anatomy.ts`](src/config/anatomy.ts)
(1 unit = 1 mm, origin = right ICA bifurcation, +x = patient's left, +y = superior, +z = anterior).
Aneurysm size/direction/bleb, the supraclinoid ICA, PCom, anterior choroidal artery, oculomotor
nerve, retraction, arachnoid patches, spatulas and the microscope axis all live there.

## Anatomy models

Brain lobes, insula, optic apparatus and tentorium are real atlas meshes, and the context arteries
follow atlas centrelines — from BodyParts3D / Z-Anatomy (CC BY-SA, see
[`public/models/LICENSE.md`](public/models/LICENSE.md)). To rebuild them:

```bash
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/LluisV/Z-Anatomy.git za
git -C za checkout HEAD -- "Resources/Models/FBX/CardioVascular41.fbx" "Resources/Models/FBX/NervousSystem100.fbx"
npm run models:extract -- za/Resources/Models/FBX /tmp/parts.json
npm run models:build -- /tmp/parts.json
```

The atlas compresses the supraclinoid ICA to ~1 mm, so that segment, the PCom origin, the anterior
choroidal artery, the oculomotor nerve and the aneurysm are defined explicitly in the config.

## Code layout

```
src/config     anatomy.ts (geometry) + sim.ts (tools, physiology, bleeding, scoring)
src/core       event bus, clock, pulse waveform
src/scene      renderer + microscope post-processing, camera, lighting, labels, ICG, endoscope PiP
src/anatomy    model loading, vessels, aneurysm (SDF + marching cubes), arachnoid, spatulas, shaders
src/tools      surgical tools, picking, instruments
src/procedure  stages + goals, engine, demo director
src/physics    vitals, bleeding, flow model, clip evaluation
src/audio      monitor beep, alarms, Doppler (Web Audio)
src/ui         start screen, HUD, toolbar, checklist, mentor, vitals, debrief, i18n (EN / 日本語)
```
