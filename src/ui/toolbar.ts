import { bus } from '../core/events';
import { state, type ToolId } from '../core/state';
import { TOOL_ORDER } from '../tools/manager';
import { applyI18n, t } from './i18n';

/** Minimal line icons (24×24, stroke = currentColor). */
const ICONS: Record<ToolId, string> = {
  suction: '<path d="M4 20 L16 8"/><circle cx="17.5" cy="6.5" r="2.2"/><path d="M3 21l2-2"/>',
  scissors: '<path d="M4 20 L13 11 M13 11 L20 4 M13 11 L20 7"/><circle cx="4.5" cy="19.5" r="1.4"/>',
  bipolar: '<path d="M4 20 L18 5 M6 21 L20 7"/><path d="M18 5l1.5-1.5 M20 7l1.5-1.5"/>',
  dissector: '<path d="M4 20 L17 7"/><path d="M17 7 q2-1 3 1"/><circle cx="20" cy="8.5" r="1.1"/>',
  spatula: '<rect x="4" y="9" width="16" height="6" rx="3" transform="rotate(-35 12 12)"/>',
  clip: '<path d="M6 18 L14 10 M8 20 L16 12"/><path d="M14 10 L20 4 M16 12 L20 4"/><circle cx="6" cy="20" r="1.5"/>',
  icg: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3"/>',
  doppler: '<path d="M3 12h3l2-5 3 10 3-8 2 3h5"/>',
  endoscope: '<path d="M4 20 L16 8"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.5" transform="rotate(45 17.5 6.5)"/><circle cx="17.5" cy="6.5" r="1"/>',
  tempClip: '<path d="M6 18 L14 10 M8 20 L16 12"/><path d="M14 10 L18 6 M16 12 L18 6"/><circle cx="18.5" cy="5.5" r="1.3"/><path d="M3 6h5"/>',
};

/** Bottom toolbar with number-key shortcuts, a hint line for the active tool and the target. */
export function buildToolbar(host: HTMLElement, onSelect: (id: ToolId) => void): void {
  const wrap = document.createElement('div');
  wrap.className = 'toolwrap';
  wrap.innerHTML = `
    <div class="toolhint panel"><span class="mono k" data-id="target"></span><span data-id="hint"></span></div>
    <div class="toolbar panel">${TOOL_ORDER.map((id, i) => `
      <button class="tool" data-tool="${id}" title="">
        <span class="key mono">${(i + 1) % 10}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>
        <span class="name" data-i18n="tool.${id}"></span>
        ${id === 'clip' ? '<span class="variant mono" data-id="variant"></span>' : ''}
      </button>`).join('')}
    </div>`;
  host.appendChild(wrap);
  applyI18n(wrap);

  const hint = wrap.querySelector<HTMLElement>('[data-id=hint]')!;
  const target = wrap.querySelector<HTMLElement>('[data-id=target]')!;
  const variant = wrap.querySelector<HTMLElement>('[data-id=variant]')!;
  let hoverKey: string | null = null;
  const refresh = () => {
    wrap.querySelectorAll<HTMLButtonElement>('button.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === state.tool));
    hint.textContent = t(`hint.${state.tool}`);
    variant.textContent = state.clipVariant === 'straight' ? t('clipStraight') : t('clipCurved');
    target.textContent = hoverKey ? `${t('target')}: ${t(`a.${hoverKey}`)}` : '';
  };
  wrap.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.tool');
    if (b) onSelect(b.dataset.tool as ToolId);
  });
  bus.on('tool:select', refresh);
  bus.on('lang', refresh);
  bus.on('hover:structure', k => { hoverKey = k; refresh(); });
  refresh();
}

/** Stacked, auto-expiring notices above the toolbar; repeated keys are de-duplicated. */
export function buildNotices(host: HTMLElement): void {
  const box = document.createElement('div');
  box.className = 'notices';
  host.appendChild(box);
  const recent = new Map<string, number>();
  bus.on('notice', ({ key, level, arg }) => {
    const now = performance.now();
    const id = arg ? `${key}:${arg}` : key;
    if ((recent.get(id) ?? 0) > now - 3500) return;
    recent.set(id, now);
    const el = document.createElement('div');
    el.className = `notice panel ${level}`;
    el.textContent = arg ? `${t(key)} ${t(arg)}` : t(key);
    box.prepend(el);
    while (box.children.length > 4) box.lastElementChild!.remove();
    setTimeout(() => el.classList.add('out'), level === 'alarm' ? 6000 : 3800);
    setTimeout(() => el.remove(), level === 'alarm' ? 6600 : 4400);
  });
}
