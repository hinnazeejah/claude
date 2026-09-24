// Loop subdivision for indexed triangle meshes (boundary edges use the cubic B-spline rule).
// The atlas gyri are coarse (~2–3 mm edges); two passes make silhouettes smooth under magnification.
import { edges } from './lib-mesh.mjs';

export function loopSubdivide(position, index) {
  const n = position.length / 3;
  const e = edges(index);
  const P = i => [position[3 * i], position[3 * i + 1], position[3 * i + 2]];
  const opp = new Map(); // edge key -> opposite vertices
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = index[t + k], b = index[t + (k + 1) % 3], c = index[t + (k + 2) % 3];
    const kk = key(a, b); (opp.get(kk) || opp.set(kk, []).get(kk)).push(c);
  }
  const nbr = Array.from({ length: n }, () => new Set());
  const bnd = Array.from({ length: n }, () => []);
  for (const [k, c] of e) {
    const [a, b] = k.split('_').map(Number);
    nbr[a].add(b); nbr[b].add(a);
    if (c === 1) { bnd[a].push(b); bnd[b].push(a); }
  }
  const out = [];
  // even (original) vertices
  for (let i = 0; i < n; i++) {
    const p = P(i);
    if (bnd[i].length === 2) {
      const a = P(bnd[i][0]), b = P(bnd[i][1]);
      out.push(...p.map((v, k) => 0.75 * v + 0.125 * (a[k] + b[k])));
    } else {
      const m = nbr[i].size; if (m < 3) { out.push(...p); continue; }
      const beta = m === 3 ? 3 / 16 : 3 / (8 * m);
      const s = [0, 0, 0]; for (const j of nbr[i]) { const q = P(j); s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; }
      out.push(...p.map((v, k) => (1 - m * beta) * v + beta * s[k]));
    }
  }
  // odd (edge) vertices
  const eid = new Map();
  for (const [k] of e) {
    const [a, b] = k.split('_').map(Number); const pa = P(a), pb = P(b); const o = opp.get(k);
    let v;
    if (o.length === 2) { const c = P(o[0]), d = P(o[1]); v = pa.map((x, j) => 0.375 * (x + pb[j]) + 0.125 * (c[j] + d[j])); }
    else v = pa.map((x, j) => 0.5 * (x + pb[j]));
    eid.set(k, out.length / 3); out.push(...v);
  }
  const idx = [];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    const ab = eid.get(key(a, b)), bc = eid.get(key(b, c)), ca = eid.get(key(c, a));
    idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { position: out, index: idx };
}

/** Drop triangles whose centroid lies outside a sphere; compacts vertices. */
export function cropSphere(position, index, c, r) {
  const keep = []; const r2 = r * r;
  for (let t = 0; t < index.length; t += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { const i = index[t + k]; x += position[3 * i]; y += position[3 * i + 1]; z += position[3 * i + 2]; }
    x = x / 3 - c[0]; y = y / 3 - c[1]; z = z / 3 - c[2];
    if (x * x + y * y + z * z < r2) keep.push(index[t], index[t + 1], index[t + 2]);
  }
  const remap = new Map(); const pos = []; const idx = [];
  for (const i of keep) {
    if (!remap.has(i)) { remap.set(i, pos.length / 3); pos.push(position[3 * i], position[3 * i + 1], position[3 * i + 2]); }
    idx.push(remap.get(i));
  }
  return { position: pos, index: idx };
}
