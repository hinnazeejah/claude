import { bus } from '../core/events';
import { state } from '../core/state';
import { STAGES } from '../procedure/stages';
import type { ProcedureEngine } from '../procedure/engine';
import { applyI18n, t } from './i18n';

/** Left checklist: the six stages with locked / active / done status. */
export function buildChecklist(host: HTMLElement, engine: ProcedureEngine): void {
  const el = document.createElement('div');
  el.className = 'checklist panel';
  el.innerHTML = `<div class="ph"><span data-i18n="checklist"></span><span class="mono pct" data-id="pct"></span></div><ol></ol>`;
  host.appendChild(el);
  applyI18n(el);
  const ol = el.querySelector('ol')!;
  const pct = el.querySelector<HTMLElement>('[data-id=pct]')!;
  const render = () => {
    ol.innerHTML = STAGES.map((s, i) => {
      const status = state.complete || i < state.stage ? 'done' : i === state.stage ? 'active' : 'locked';
      const bar = status === 'active' ? `<span class="bar"><i style="width:${Math.round(engine.stageProgress(i) * 100)}%"></i></span>` : '';
      return `<li class="${status}"><span class="st mono">${status === 'done' ? '✓' : i + 1}</span><span class="nm">${t(`stage.${s.id}.title`)}${bar}</span></li>`;
    }).join('');
    pct.textContent = `${Math.round(engine.progress * 100)}%`;
  };
  ['stage:changed', 'stage:progress', 'procedure:complete', 'lang'].forEach(e => bus.on(e as 'lang', render));
  render();
}

/** Bottom-right mentor: calm guidance, sub-task checkboxes and progress. Collapsible (M key). */
export function buildMentor(host: HTMLElement, engine: ProcedureEngine): void {
  const el = document.createElement('div');
  el.className = 'mentor panel';
  host.appendChild(el);
  let collapsed = false;
  const render = () => {
    const i = Math.min(state.stage, STAGES.length - 1);
    const s = STAGES[i];
    const pct = Math.round(engine.progress * 100);
    const head = `<button class="mh" data-act="toggle" aria-expanded="${!collapsed}">
      <span class="mono k">${t('mentor')} · ${state.complete ? '✓' : `${i + 1}/${STAGES.length}`}</span>
      <span class="mono pct">${pct}%</span><span class="chev">${collapsed ? '▴' : '▾'}</span></button>`;
    if (collapsed) { el.innerHTML = head; el.classList.add('collapsed'); return; }
    el.classList.remove('collapsed');
    const body = state.complete
      ? `<p class="say">${t('procedureComplete')}</p>`
      : `<h3>${t(`stage.${s.id}.title`)}</h3>
         <p class="say">${t(`stage.${s.id}.say`)}</p>
         <ul>${s.tasks.map(task => {
           const done = engine.ticked[i].has(task.id);
           const prog = task.progress && !done ? ` <span class="mono cnt">${task.progress().join('/')}</span>` : '';
           return `<li class="${done ? 'done' : ''}${task.optional ? ' opt' : ''}"><span class="cb">${done ? '✓' : ''}</span>${t(`task.${task.id}`)}${task.optional ? ` <span class="optl">${t('optional')}</span>` : ''}${prog}</li>`;
         }).join('')}</ul>`;
    el.innerHTML = `${head}<div class="mb">${body}<div class="prog"><i style="width:${pct}%"></i></div></div>`;
  };
  el.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('[data-act=toggle]')) { collapsed = !collapsed; render(); }
  });
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'm' && (e.target as HTMLElement)?.tagName !== 'INPUT') { collapsed = !collapsed; render(); }
  });
  ['stage:changed', 'stage:progress', 'procedure:complete', 'lang', 'arachnoid:cut', 'adhesion:freed'].forEach(ev => bus.on(ev as 'lang', render));
  render();
}
