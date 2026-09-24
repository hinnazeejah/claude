import { bus } from '../core/events';
import { applyI18n, getLang, setLang } from './i18n';

/** Top bar: magnification readout, label toggle, fissure-opening slider, language switch. */
export function buildHud(host: HTMLElement, opts: { opening: number; magnification: number }) {
  const bar = document.createElement('div');
  bar.className = 'topbar panel';
  bar.innerHTML = `
    <span class="brand">IC-PC SIM</span><span class="sep"></span>
    <span class="mono"><span class="k" data-i18n="mag"></span><span data-id="mag">×${opts.magnification.toFixed(1)}</span></span>
    <span class="sep"></span>
    <button class="chip" data-act="labels" aria-pressed="false" data-i18n="labels"></button>
    <label class="mono"><span class="k" data-i18n="opening"></span>
      <input type="range" min="0" max="100" value="${Math.round(opts.opening * 100)}" data-id="opening" /></label>
    <span class="sep"></span>
    <button class="chip" data-act="lang" data-i18n="lang"></button>`;
  host.appendChild(bar);
  applyI18n(bar);

  const mag = bar.querySelector<HTMLElement>('[data-id=mag]')!;
  const labelsBtn = bar.querySelector<HTMLButtonElement>('[data-act=labels]')!;
  const slider = bar.querySelector<HTMLInputElement>('[data-id=opening]')!;
  bus.on('view:magnification', m => (mag.textContent = `×${m.toFixed(1)}`));
  bus.on('view:labels', on => labelsBtn.setAttribute('aria-pressed', String(on)));
  bus.on('anatomy:opening', v => (slider.value = String(Math.round(v * 100))));
  bar.addEventListener('click', e => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === 'lang') setLang(getLang() === 'en' ? 'ja' : 'en');
    if (act === 'labels') bus.emit('view:labels', labelsBtn.getAttribute('aria-pressed') !== 'true');
  });
  slider.addEventListener('input', () => bus.emit('anatomy:opening', Number(slider.value) / 100));
  return bar;
}

export function toast(host: HTMLElement, text: string, ms = 2600): void {
  const el = document.createElement('div');
  el.className = 'toast panel';
  el.textContent = text;
  host.appendChild(el);
  setTimeout(() => (el.style.opacity = '0'), ms);
  setTimeout(() => el.remove(), ms + 500);
}
