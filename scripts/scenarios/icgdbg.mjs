export default async function (page, h) {
  const S = (js) => h.state(js);
  await S(`(() => { const a = __sim.anatomy; a.arachnoid.forEach(s => { s.cut = true; s.mesh.visible = false; }); __sim.state.retraction.allowed = 1; __sim.state.retraction.opening = 0.8; })()`);
  await h.wait(2000);
  await S(`__sim.icg.start()`);
  for (let i = 0; i < 60; i++) { const t = await S('__sim.icg.t'); if (t > 4) break; await h.wait(1000); }
  await h.shot('m5-04-icg-clean');
  h.log(await S(`(() => { const out = []; __sim.anatomy.vessels.get('ica').meshes.forEach(m => out.push(m.material.type, m.material.color.getHexString(), m.visible)); out.push('glow', __sim.icg.glow.size, 'flow', JSON.stringify(__sim.state.flow)); return JSON.stringify(out); })()`));
}
