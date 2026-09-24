import { bus } from '../core/events';
import { applyI18n, getLang, setLang } from './i18n';

/** Title card with the educational-use disclaimer. Resolves when the user starts. */
export function showStartScreen(host: HTMLElement): { ready: () => void; setStatus: (s: string) => void } {
  const el = document.createElement('div');
  el.className = 'start';
  el.innerHTML = `
    <div class="card panel">
      <h1 data-i18n="title"></h1>
      <div class="sub" data-i18n="subtitle"></div>
      <div class="disc"><b data-i18n="disclaimerTitle"></b><p data-i18n="disclaimer"></p></div>
      <h2 data-i18n="controls"></h2>
      <ul>
        <li data-i18n="ctlZoom"></li><li data-i18n="ctlPan"></li><li data-i18n="ctlTilt"></li>
        <li data-i18n="ctlFocus"></li><li data-i18n="ctlLabels"></li><li data-i18n="ctlTools"></li>
      </ul>
      <div class="row">
        <button class="primary" data-act="start" data-i18n="start" disabled></button>
        <button class="secondary" data-act="demo" data-i18n="demo" disabled></button>
        <span class="grow status"></span>
        <button class="chip" data-act="lang" data-i18n="lang"></button>
      </div>
      <div class="attr" data-i18n="attribution"></div>
    </div>`;
  host.appendChild(el);
  applyI18n(el);
  const status = el.querySelector<HTMLElement>('.status')!;
  el.addEventListener('click', e => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === 'lang') setLang(getLang() === 'en' ? 'ja' : 'en');
    if (act === 'start' || act === 'demo') {
      el.remove();
      bus.emit('start', { demo: act === 'demo' });
    }
  });
  return {
    ready: () => el.querySelectorAll('button').forEach(b => (b.disabled = false)),
    setStatus: s => (status.textContent = s),
  };
}
