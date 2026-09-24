// M2 scenario: exercises every tool through the real mouse and keyboard.
export default async function (page, h) {
  const centerOf = async sel => h.state(`(() => {
    const out = []; const a = __sim.anatomy;
    ${sel}.forEach(m => { m.geometry.computeBoundingSphere(); const c = m.geometry.boundingSphere.center.clone(); m.localToWorld(c); out.push(c.toArray()); });
    return out; })()`);
  const clickAt = async (p, opts = {}) => { const s = await h.project(p); await page.mouse.move(s.x, s.y, { steps: 1 }); await h.wait(80); await page.mouse.down(); if (opts.hold) await h.wait(opts.hold); await page.mouse.up(); await h.wait(60); };

  // 1) scissors: cut the sylvian arachnoid segments
  await h.key('2');
  const syl = await centerOf(`a.arachnoid.filter(s => s.patch.startsWith('sylvian')).map(s => s.mesh)`);
  const first = await h.project(syl[0]);
  await page.mouse.move(first.x, first.y, { steps: 1 }); await h.wait(400);
  await h.shot('m2-01-scissors-hover');
  for (const p of syl) await clickAt(p);
  await h.wait(600);
  h.log('sylvian cut', await h.state(`JSON.stringify(__sim.state.arachnoid.cut)`), 'allowed', await h.state('__sim.state.retraction.allowed.toFixed(2)'));

  // 2) spatula: open the fissure by dragging the temporal lobe down
  await h.key('5');
  const tlw = await h.state(`__sim.anatomy.spatulas.group.children[1].localToWorld(new __sim.anatomy.root.position.constructor(0, 0.9, 6)).toArray()`);
  const tl = await h.project(tlw);
  h.log('spatula target', JSON.stringify(tlw), 'hover', await h.state('String(__sim.tools.active.target && __sim.tools.active.target.kind)'));
  await page.mouse.move(tl.x, tl.y, { steps: 1 }); await h.wait(200);
  await page.mouse.down(); await page.mouse.move(tl.x, tl.y + 260, { steps: 6 }); await page.mouse.up();
  await h.wait(1200);
  h.log('opening', await h.state('__sim.state.retraction.opening.toFixed(2)'));
  await h.shot('m2-02-opened');

  // 3) cut the remaining arachnoid (carotid cistern + neck) and free neck adhesions with the dissector
  const rest = await centerOf(`a.arachnoid.filter(s => !s.cut).map(s => s.mesh)`);
  await h.key('2');
  for (const p of rest) await clickAt(p);
  await h.wait(500);
  await h.key('4');
  const strands = await centerOf(`a.adhesions.filter(x => x.group !== 'dome').map(x => x.mesh)`);
  if (strands.length) {
    const s0 = await h.project(strands[0]);
    await page.mouse.move(s0.x, s0.y, { steps: 1 }); await h.wait(300);
    await h.shot('m2-03-dissector-hover');
  }
  for (const p of strands) {
    const s = await h.project(p);
    await page.mouse.move(s.x, s.y, { steps: 1 }); await page.mouse.down();
    for (let i = 0; i < 6; i++) { await page.mouse.move(s.x + (i % 2 ? 5 : -5), s.y + (i % 2 ? 3 : -3), { steps: 1 }); }
    await page.mouse.up();
  }
  await h.wait(400);
  h.log('adhesions freed', await h.state(`JSON.stringify(__sim.state.adhesions.freed)`), 'risk', await h.state('__sim.state.ruptureRisk.toFixed(3)'));

  // 4) bipolar on the frontal lobe → coagulation mark
  await h.key('3');
  await clickAt([-14, 12, 12], { hold: 4000 });
  h.log('coagulations', await h.state('__sim.state.coagulations'));

  // 5) temporary clip on proximal ICA
  await h.key('0');
  const ica = await h.project([-3.6, -10.5, 3.2]);
  await page.mouse.move(ica.x, ica.y, { steps: 1 }); await h.wait(300);
  await h.shot('m2-04-tempclip-ghost');
  await page.mouse.down(); await page.mouse.up(); await h.wait(300);
  h.log('temp clip', await h.state('JSON.stringify(__sim.state.tempClip)'));

  // 6) permanent clip over the neck
  await h.key('6');
  const neck = await h.project([-5.2, -5.6, 0.8]);
  await page.mouse.move(neck.x, neck.y, { steps: 1 }); await h.wait(300);
  await h.shot('m2-05-clip-ghost');
  await page.mouse.down(); await page.mouse.up(); await h.wait(300);
  await page.mouse.move(neck.x + 200, neck.y - 200); await h.wait(500);
  await h.shot('m2-06-clip-applied');
  h.log('clips', await h.state('__sim.state.clips.length'), 'ruptured', await h.state('__sim.state.ruptured'));
  h.log('log', await h.state('JSON.stringify(__sim.state.log.map(e => e.type))'));
}
