// M4–M6 visual check: rupture bleeding + vitals, clip, ICG, endoscope, debrief.
export default async function (page, h) {
  const S = (js) => h.state(js);
  await S(`(() => { const a = __sim.anatomy; const st = __sim.state;
    a.arachnoid.forEach(s => { s.cut = true; s.mesh.visible = false; st.arachnoid.cut[s.patch] = (st.arachnoid.cut[s.patch]||0)+1; });
    st.retraction.allowed = 1; st.retraction.opening = 0.8; })()`);
  await h.wait(2500);
  // rupture
  await S(`(() => { const s = __sim.state; s.ruptureThreshold = 0; })()`);
  await S(`__sim.tools.tools.dissector.onDrag({ kind: 'aneurysm', region: 'dome' }, 0, 0, 1)`);
  await h.wait(9000);
  h.log('after rupture', await S(`JSON.stringify({ ruptured: __sim.state.ruptured, rate: __sim.bleeding.rate.toFixed(2), vol: __sim.bleeding.volume.toFixed(1), sys: __sim.vitals.sys.toFixed(0), hr: __sim.vitals.hr.toFixed(0), ebl: __sim.vitals.ebl.toFixed(0) })`));
  await h.shot('m4-01-rupture');
  // control: temp clip, suction, clip
  await S(`(() => { const st = __sim.state; st.tempClip.applied = true; st.tempClip.since = st.time; st.tempClip.count = 1; })()`);
  await S(`(() => { const b = __sim.bleeding; b.volume = 2; })()`);
  await S(`(async () => {
    const { idealClipPose } = await import('/src/physics/clipEval.ts');
    const { buildEvalGeometry } = await import('/src/physics/geometry.ts');
    const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => null);
    const F = __sim.view.camera.getWorldDirection(__sim.view.camera.position.clone());
    __sim.tools.tools.clip.place(idealClipPose(buildEvalGeometry(), F));
  })()`);
  await S(`(() => { const st = __sim.state; st.tempClip.applied = false; })()`);
  await h.wait(4000);
  h.log('after clip', await S(`JSON.stringify({ clip: __sim.state.clipResult, rate: __sim.bleeding.rate.toFixed(2), flow: __sim.state.flow })`));
  await h.shot('m4-02-clipped');
  await S(`__sim.icg.start()`);
  await h.wait(6000);
  await h.shot('m5-01-icg');
  await S(`__sim.icg.stop()`);
  await S(`__sim.endoscope.toggle()`);
  await h.wait(2000);
  await h.shot('m5-02-endoscope');
  await page.click('button[data-act=end]');
  await h.wait(1500);
  await h.shot('m6-01-debrief');
}
