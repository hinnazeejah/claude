# Anatomy model license

`anatomy.glb` (and `src/anatomy/data/vessels.generated.json`) are derived from:

- **BodyParts3D** — The Database Center for Life Science (DBCLS) — CC BY-SA 2.1 Japan
- **Z-Anatomy** — The open source atlas of anatomy (https://www.z-anatomy.com) — CC BY-SA 4.0

Modifications: selected right-sided meshes were extracted, re-centred on the right ICA bifurcation,
converted to millimetres, cropped to the surgical field, Loop-subdivided and merged; arterial
centrelines were extracted from the vessel tubes (see `scripts/build-models.mjs`).

These derived files are distributed under **CC BY-SA 4.0** (share-alike).
