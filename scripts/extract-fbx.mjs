// Step 1 of the model pipeline: pull the named meshes out of the Z-Anatomy FBX files
// into a compact JSON cache (world space, millimetres, indexed). Parsing a 60 MB FBX is slow,
// so build-models.mjs works from this cache.
import fs from 'node:fs';
import path from 'node:path';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {} }), createElement: () => ({ style: {} }) };
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const { mergeVertices } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');

const [srcDir, outFile] = process.argv.slice(2);
const want = JSON.parse(fs.readFileSync(new URL('./model-parts.json', import.meta.url)));
const out = {};
for (const [file, names] of Object.entries(want.files)) {
  const buf = fs.readFileSync(path.join(srcDir, file));
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !names.includes(o.name)) return;
    let g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    g.scale(10, 10, 10); // FBX is in cm → mm
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.clearGroups();
    g = mergeVertices(g, 1e-3);
    out[o.name] = {
      position: Array.from(g.attributes.position.array, v => +v.toFixed(3)),
      index: Array.from(g.index.array),
    };
    console.log(o.name, g.attributes.position.count, 'verts');
  });
}
fs.writeFileSync(outFile, JSON.stringify(out));
