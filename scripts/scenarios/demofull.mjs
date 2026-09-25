// Full demo run: wait until the demo finishes (or 40 min), then report and screenshot.
export default async function (page, h) {
  const t0 = Date.now();
  let last = -1;
  while (Date.now() - t0 < 40 * 60000) {
    const st = await h.state('JSON.stringify({ stage: __sim.state.stage, complete: __sim.state.complete, running: __sim.demo.running })');
    const o = JSON.parse(st);
    if (o.stage !== last) { h.log(new Date().toISOString().slice(11, 19), st); last = o.stage; if (o.stage === 5) await h.shot('m6-03-demo-stage6'); }
    if (!o.running) break;
    await h.wait(5000);
  }
  h.log('final', await h.state('JSON.stringify({ stage: __sim.state.stage, complete: __sim.state.complete, clip: __sim.state.clipResult, rupture: __sim.state.ruptured, ebl: Math.round(__sim.state.vitals.ebl) })'));
  await h.shot('m6-04-demo-end');
}
