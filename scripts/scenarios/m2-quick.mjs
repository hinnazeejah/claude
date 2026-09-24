// Quick check: open the fissure programmatically, cut all arachnoid, apply the temp clip.
export default async function (page, h) {
  await h.state(`(() => { const a = __sim.anatomy; a.arachnoid.filter(s => s.patch.startsWith('sylvian')).forEach(s => { s.cut = true; s.mesh.visible = false; __sim.state.arachnoid.cut[s.patch] = (__sim.state.arachnoid.cut[s.patch]||0)+1; }); __sim.state.retraction.allowed = 1; __sim.state.retraction.opening = 0.8; })()`);
  await h.wait(2500);
  await h.shot('m2q-01-neck-arachnoid');
  await h.state(`__sim.anatomy.arachnoid.forEach(s => s.mesh.visible = false)`);
  await h.key('0');
  const ica = await h.project([-3.6, -10.5, 3.2]);
  await page.mouse.move(ica.x, ica.y); await h.wait(1500);
  await page.mouse.down(); await page.mouse.up(); await h.wait(800);
  await page.mouse.move(ica.x + 150, ica.y - 150); await h.wait(1500);
  await h.shot('m2q-02-tempclip');
  h.log('temp', await h.state('JSON.stringify(__sim.state.tempClip)'));
}
