// Centreline extraction for BodyParts3D tube meshes.
// Each vessel is an open tube made of rings of vertices. Starting from one open end we walk
// ring by ring (breadth-first layers); a ring's centroid is a centreline point and its mean
// distance to the centroid is the local radius.
import { boundaryLoops, components, neighbours } from './lib-mesh.mjs';

export function tubeCenterlines(position, index) {
  const n = position.length / 3;
  const nb = neighbours(n, index);
  const { comp } = components(n, index);
  const loops = boundaryLoops(index);
  const byComp = new Map();
  for (const l of loops) { const c = comp[l[0]]; (byComp.get(c) || byComp.set(c, []).get(c)).push(l); }
  const lines = [];
  for (const [, ls] of byComp) {
    if (ls.length < 2) continue;
    const layer = new Int32Array(n).fill(-1);
    let frontier = ls[0].slice(); frontier.forEach(v => (layer[v] = 0));
    const rings = [frontier];
    while (frontier.length) {
      const next = [];
      for (const v of frontier) for (const w of nb[v]) if (layer[w] < 0) { layer[w] = rings.length; next.push(w); }
      if (next.length) rings.push(next);
      frontier = next;
    }
    const pts = rings.map(r => {
      let x = 0, y = 0, z = 0;
      for (const v of r) { x += position[3 * v]; y += position[3 * v + 1]; z += position[3 * v + 2]; }
      x /= r.length; y /= r.length; z /= r.length;
      let rad = 0;
      for (const v of r) rad += Math.hypot(position[3 * v] - x, position[3 * v + 1] - y, position[3 * v + 2] - z);
      return [x, y, z, rad / r.length];
    });
    lines.push(pts);
  }
  return lines;
}

/** Arc-length resample a polyline [x,y,z,r][] to spacing ds (mm), with light smoothing. */
export function resample(pts, ds) {
  const out = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let t0 = 0;
    while (acc + L * (1 - t0) >= ds) {
      const t = t0 + (ds - acc) / L; acc = 0; t0 = t;
      out.push(a.map((v, k) => v + (b[k] - v) * t));
    }
    acc += L * (1 - t0);
  }
  out.push(pts[pts.length - 1]);
  for (let it = 0; it < 2; it++) for (let i = 1; i < out.length - 1; i++)
    out[i] = out[i].map((v, k) => (out[i - 1][k] + 2 * v + out[i + 1][k]) / 4);
  return out;
}
