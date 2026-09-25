// M3: checklist + mentor panels; progress through stage 1 and identification.
export default async function (page, h) {
  await h.wait(1500);
  await h.shot('m3-01-panels');
  // cut sylvian arachnoid programmatically through the real tissue op, then open with P
  await h.state(`(() => { const a = __sim.anatomy; })()`);
  await h.key('2');
  const segs = await h.state(`__sim.anatomy.arachnoid.filter(s => s.patch.startsWith('sylvian')).map(s => { const m = s.mesh; m.geometry.computeBoundingSphere(); return m.localToWorld(m.geometry.boundingSphere.center.clone()).toArray(); })`);
  for (const p of segs) { const s = await h.project(p); await page.mouse.move(s.x, s.y); await h.wait(60); await page.mouse.down(); await page.mouse.up(); }
  await h.wait(500);
  for (let i = 0; i < 8; i++) await h.key('p');
  await h.wait(2500);
  h.log('stage', await h.state('__sim.state.stage'), 'opening', await h.state('__sim.state.retraction.opening.toFixed(2)'), 'cut', await h.state('JSON.stringify(__sim.state.arachnoid.cut)'));
  // identify M1 by resting the cursor on it
  const m1 = await h.project([-9.7, 5.8, 3.1]);
  await page.mouse.move(m1.x, m1.y); await h.wait(12000);
  h.log('look', await h.state('String(__sim.tools.lookKey)'), 'hits', await h.state('JSON.stringify(__sim.tools.lastHits.slice(0,4).map(x=>x.kind+":"+x.structure))'), 'frames dt', await h.state('__sim.clock.dt'));
  h.log('dwell', await h.state('__sim.procedure.dwell'), 'hover', await h.state('String(__sim.procedure.hover)'));
  h.log('identified', await h.state('JSON.stringify([...__sim.state.identified])'));
  await h.shot('m3-02-stage2');
  await page.click('button[data-act=lang]');
  await h.wait(800);
  await h.shot('m3-03-ja');
}
