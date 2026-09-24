// Model pipeline, step 2: turn the extracted Z-Anatomy / BodyParts3D meshes into
//   public/models/anatomy.glb                 – brain, nerves, tentorium (cropped, subdivided)
//   src/anatomy/data/vessels.generated.json   – arterial centrelines + radii (mm)
// Everything is re-centred on the right ICA bifurcation (origin) and kept in anatomical axes:
//   +x = patient's left (so the RIGHT side is negative x), +y = superior, +z = anterior. 1 unit = 1 mm.
//
// Usage: node scripts/extract-fbx.mjs <Z-Anatomy>/Resources/Models/FBX parts.json
//        node scripts/build-models.mjs parts.json
import fs from 'node:fs';
import { tubeCenterlines, resample } from './lib-centerline.mjs';
import { loopSubdivide, cropSphere } from './lib-subdiv.mjs';

globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend?.(); }); } readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.(); }); } };
const THREE = await import('three');
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

const parts = JSON.parse(fs.readFileSync(process.argv[2]));
// Right ICA bifurcation in the source model (mm, after cm→mm): midpoint of ICA end and M1 start.
const ORIGIN = [-9.9, 1602.9, 21.5];
const CROP_R = 62;

const shift = p => { const o = p.slice(); for (let i = 0; i < o.length; i += 3) { o[i] -= ORIGIN[0]; o[i + 1] -= ORIGIN[1]; o[i + 2] -= ORIGIN[2]; } return o; };

// ---------- vessels ----------
const VESSELS = {
  ica: 'Internal_carotid_arteryr',
  pcom: 'Posterior_communicating_arteryr',
  m1: 'Middle_cerebral_artery_(M1-segment)r',
  m2: 'Insular_branches_of_middle_cerebral_artery_(M2)r',
  m3: 'Middle_cerebral_artery_(M3-segment)r',
  mcaTemporal: 'Temporal_branches_of_middle_cerebral_arteryr',
  a1: 'Anterior_cerebral_arteryr',
  acom: null,
  pca: 'Posterior_cerebral_arteryr',
  basilar: 'Basilar_artery',
  ophthalmic: 'Ophthalmic_arteryr',
};
const vessels = {};
for (const [k, name] of Object.entries(VESSELS)) {
  if (!name) continue;
  const p = parts[name];
  const lines = tubeCenterlines(shift(p.position), p.index)
    .map(l => l.slice(1, -1)) // end rings are caps / tapered
    .filter(l => l.length > 3)
    .map(l => resample(l, 1.0).map(q => q.map(v => +v.toFixed(2))));
  vessels[k] = lines;
}
fs.mkdirSync('src/anatomy/data', { recursive: true });
fs.writeFileSync('src/anatomy/data/vessels.generated.json', JSON.stringify(vessels));
console.log('vessels:', Object.entries(vessels).map(([k, v]) => `${k}(${v.length})`).join(' '));

// ---------- surface meshes ----------
const GROUPS = {
  frontal: { subdiv: 2, names: ['Orbital_gyrir', 'Straight_gyrus_(Gyrus_rectus)r', 'Orbital_part_of__inferior_frontal_gyrusr', 'Triangular_part_of_inferior_frontal_gyrusr', 'Opercular_part_of_inferior_frontal_gyrusr', 'Orbital_gyri_(Frontomarginal_gyrus_and_sulcus*)r', 'Orbital_sulci_(Lateral_Orbital_sulcus*)r', 'Orbital_sulci_(H-shaped_orbital_sulci*)r', 'Olfactory_sulcusr', 'Inferior_frontal_sulcusr', 'Middle_frontal_gyrusr', 'Precentral_gyrusr'] },
  temporal: { subdiv: 2, names: ['Temporal_poler', 'Superior_temporal_gyrus_(Lateral_part)r', 'Middle_temporal_gyrusr', 'Superior_temporal_sulcusr', 'Temporal_planer', 'Medial_occipitotemporal_gyrus_(Parahippocampal*)r', 'Inferior_temporal_gyrusr'] },
  insula: { subdiv: 2, names: ['Insula_(Subcentral_gyrus_and_ant_and_post_sulci*)r', 'Circular_sulcus_of_insular'] },
  opticNerve: { subdiv: 1, names: ['Optic_nerve_(II)r', 'Optic_chiasmr', 'Optic_tractr'] },
  tentorium: { subdiv: 1, names: ['Tentorium_cerebellir'] },
};
const scene = new THREE.Scene();
for (const [g, def] of Object.entries(GROUPS)) {
  const geos = [];
  for (const name of def.names) {
    let m = { position: shift(parts[name].position), index: parts[name].index };
    m = cropSphere(m.position, m.index, [0, 0, 0], CROP_R);
    if (def.crop) m = cropSphere(m.position, m.index, def.crop.c, def.crop.r);
    if (!m.index.length) continue;
    for (let i = 0; i < def.subdiv; i++) m = loopSubdivide(m.position, m.index);
    m = cropSphere(m.position, m.index, [0, 0, 0], CROP_R);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.position, 3));
    geo.setIndex(m.index);
    geos.push(geo);
  }
  const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  const geo = mergeGeometries(geos);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: g }));
  mesh.name = g;
  scene.add(mesh);
  console.log(g, geo.attributes.position.count, 'verts');
}
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
fs.mkdirSync('public/models', { recursive: true });
fs.writeFileSync('public/models/anatomy.glb', Buffer.from(glb));
console.log('anatomy.glb', (glb.byteLength / 1e6).toFixed(2), 'MB');
