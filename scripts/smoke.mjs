// Headless smoke test: starts Vite, loads the app in Chromium, fails on console errors,
// clicks Start and saves screenshots to ./screenshots.
// Usage: node scripts/smoke.mjs [--url http://localhost:5173] [--shots name:js-expression ...]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
const shots = args.filter(a => a.includes(':=')).map(a => [a.slice(0, a.indexOf(':=')), a.slice(a.indexOf(':=') + 2)]);
let server = null;
let url = urlArg;
if (!url) {
  server = spawn('node_modules/.bin/vite', ['--port', '5199', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  url = 'http://localhost:5199/';
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('vite did not start')), 30000);
    server.stdout.on('data', d => { if (String(d).includes('Local')) { clearTimeout(to); res(); } });
  });
}
const exe = fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(p => fs.existsSync(p)) : undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning' && process.env.VERBOSE) console.log('warn:', m.text()); });
page.on('pageerror', e => errors.push(String(e)));
fs.mkdirSync('screenshots', { recursive: true });
try {
  await page.goto(url);
  await page.waitForSelector('button[data-act=start]:not([disabled])', { timeout: 90000 });
  await page.screenshot({ path: 'screenshots/00-start.png' });
  await page.click('button[data-act=start]');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'screenshots/01-field.png' });
  for (const [name, js] of shots) {
    const r = await page.evaluate(js);
    if (name.startsWith('eval')) { console.log(name, JSON.stringify(r)); continue; }
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `screenshots/${name}.png` });
  }
} catch (e) {
  errors.push(String(e));
}
await browser.close();
server?.kill();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('smoke OK');
