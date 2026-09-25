export default async function (page, h) {
  const S = (js) => h.state(js);
  await S(`(() => { const a = __sim.anatomy; const st = __sim.state;
    a.arachnoid.forEach(s => { s.cut = true; s.mesh.visible = false; });
    st.retraction.allowed = 1; st.retraction.opening = 0.8; })()`);
  await h.wait(2500);
  await S(`(() => { __sim.state.ruptureThreshold = 0; __sim.tools.tools.dissector.onDrag({ kind: 'aneurysm', region: 'dome' }, 0, 0, 1); __sim.bleeding.volume = 7; })()`);
  await h.wait(4000);
  await h.shot('m4-03-rupture-pool');
  await S(`(() => { __sim.bleeding.volume = 0; __sim.state.ruptured = false; })()`);
  await S(`__sim.icg.start()`);
  // wait until the dye has arrived (sim time)
  for (let i = 0; i < 60; i++) { const t = await S('__sim.icg.t'); if (t > 5.5) break; await h.wait(1000); }
  h.log('icg t', await S('__sim.icg.t.toFixed(1)'));
  await h.shot('m5-03-icg-filled');
}
