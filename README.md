# IC-PC Aneurysm Clipping Simulator

Browser-based educational simulator of microsurgical clipping of a **right internal carotid –
posterior communicating artery (IC-PC) aneurysm** through a **pterional, transsylvian approach**,
rendered as if seen through an operating microscope.

> **Educational demonstration only.** Not a clinical training device, not validated, and not
> medical advice. Anatomy and physiology are simplified.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # type-check + production build
npm run smoke      # headless Chromium smoke test → ./screenshots
```

## Controls (so far)

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
| Left button | Use the tool (click, hold or drag depending on the tool) |

### Tools

| Key | Tool | Rule |
|---|---|---|
| 1 | Suction | Hold to suction (blood arrives in M4). On the dome it raises the hidden rupture risk. |
| 2 | Micro scissors | Click arachnoid segments or adhesion strands to cut. Cutting vessels, nerves or the aneurysm injures them. |
| 3 | Bipolar | Hold ~0.6 s to coagulate: seals oozing points; coagulating PCom / AChA / major arteries / nerves is penalised. |
| 4 | Dissector | Drag along adhesion strands to free the proximal and distal neck; drag on arachnoid to open it bluntly. Dome/bleb contact raises rupture risk. |
| 5 | Spatula | Drag the frontal lobe up / temporal lobe down to open the fissure (only as far as the cut arachnoid allows). |
| 6 | Aneurysm clip | Ghost clip at the cursor: `Q/E` roll, `A/D` tilt, `W/S` blade depth, `C` straight/curved, click to apply, `X` remove last. |
| 7 | ICG | (M5) fluorescence angiography |
| 8 | Micro Doppler | (M5) flow sounds |
| 9 | Endoscope | (M5) picture-in-picture view behind the aneurysm |
| 0 | Temporary clip | Click the proximal ICA to apply (occlusion timer starts), click the clip to release. |

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
src/config     anatomy + (later) simulation tuning
src/core       event bus, clock, pulse waveform
src/scene      renderer + microscope post-processing, camera controls, lighting, labels
src/anatomy    model loading, vessels, aneurysm (SDF + marching cubes), arachnoid, spatulas, shaders
src/tools      (M2) surgical tools
src/procedure  (M3) stages, goals, demo mode
src/physics    (M4/M5) bleeding, flow network, clip evaluation
src/audio      (M4/M5) Doppler, alarms
src/ui         start screen, HUD, i18n (EN / 日本語)
```
