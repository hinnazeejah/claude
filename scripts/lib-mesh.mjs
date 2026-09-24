// Small mesh utilities shared by the model build scripts (plain arrays, no three.js needed).
export function edges(index) {
  const m = new Map();
  for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = index[t + k], b = index[t + (k + 1) % 3];
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}
export function neighbours(n, index) {
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = index[t + k], b = index[t + (k + 1) % 3];
    nb[a].add(b); nb[b].add(a);
  }
  return nb.map(s => [...s]);
}
export function boundaryLoops(index) {
  const e = edges(index); const adj = new Map();
  for (const [k, c] of e) if (c === 1) {
    const [a, b] = k.split('_').map(Number);
    (adj.get(a) || adj.set(a, []).get(a)).push(b);
    (adj.get(b) || adj.set(b, []).get(b)).push(a);
  }
  const seen = new Set(); const loops = [];
  for (const s of adj.keys()) {
    if (seen.has(s)) continue;
    const loop = []; const stack = [s];
    while (stack.length) { const v = stack.pop(); if (seen.has(v)) continue; seen.add(v); loop.push(v); for (const w of adj.get(v)) if (!seen.has(w)) stack.push(w); }
    loops.push(loop);
  }
  return loops;
}
export function components(n, index) {
  const nb = neighbours(n, index); const comp = new Int32Array(n).fill(-1); let c = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0 || nb[i].length === 0) continue;
    const st = [i]; while (st.length) { const v = st.pop(); if (comp[v] >= 0) continue; comp[v] = c; for (const w of nb[v]) if (comp[w] < 0) st.push(w); }
    c++;
  }
  return { comp, count: c };
}
