// Demo mode: start via the Demo button, let it run, then take over with a key.
export default async function (page, h) {
  await h.wait(90000);
  h.log('stage', await h.state('__sim.state.stage'), 'running', await h.state('__sim.demo.running'), 'cut', await h.state('JSON.stringify(__sim.state.arachnoid.cut)'), 'identified', await h.state('JSON.stringify([...__sim.state.identified])'));
  await h.shot('m6-02-demo');
  await page.keyboard.press('Escape');
  await h.wait(1500);
  h.log('after takeover running', await h.state('__sim.demo.running'), 'virtual', await h.state('__sim.tools.virtual'));
}
