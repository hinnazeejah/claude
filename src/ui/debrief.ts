import { state } from '../core/state';
import { SIM } from '../config/sim';
import { STAGES } from '../procedure/stages';
import { applyI18n, t } from './i18n';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fill = (key: string, vars: Record<string, string | number>) => t(key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/** Specific, event-based advice (at most five items). */
export function debriefTips(): string[] {
  const r = state.clipResult;
  const E = SIM.eval;
  const tips: string[] = [];
  const occ = state.tempClip.totalSeconds + (state.tempClip.applied ? state.time - state.tempClip.since : 0);
  if (state.ruptured) {
    tips.push(t('tipRupture'));
    if (r && r.sacFilling === 0) tips.push(t('tipRuptureHandled'));
  }
  if (occ > SIM.vitals.safeOcclusionS) tips.push(fill('tipOcclusion', { m: (occ / 60).toFixed(1) }));
  if (!state.ruptured && state.tempClip.count === 0 && state.ruptureRisk > state.ruptureThreshold * 0.4) tips.push(t('tipNoTemp'));
  if (r) {
    if (r.neckClosure < E.sealedAt) tips.push(fill('tipPartial', { pct: Math.round(r.neckClosure * 100) }));
    else if (r.residualNeckMm > E.residualWarnMm) tips.push(fill('tipResidual', { mm: r.residualNeckMm.toFixed(1) }));
    if (r.icaStenosis > E.stenosisWarn) tips.push(fill('tipStenosis', { pct: Math.round(r.icaStenosis * 100) }));
    if (!r.pcomPatent) tips.push(t('tipPcom'));
    if (!r.achaPatent) tips.push(t('tipAcha'));
    const verified = ['doppler:pcom', 'doppler:acha', 'icg'].every(k => (state.checks.get(k) ?? -1) > state.lastClipChange);
    if (!verified) tips.push(t('tipVerify'));
  }
  if (state.retraction.excessiveSeconds > 20) tips.push(fill('tipRetraction', { s: Math.round(state.retraction.excessiveSeconds) }));
  const vesselHarm = state.injuries.filter(i => i.structure !== 'pia').length + state.occluded.size;
  if (vesselHarm > 0) tips.push(fill('tipVessel', { n: vesselHarm }));
  if (!tips.length) tips.push(t('tipGreat'));
  return tips.slice(0, 5);
}

export function clipVerdict(): 'good' | 'partial' | 'none' {
  const r = state.clipResult;
  if (!r || r.offTarget) return 'none';
  const E = SIM.eval;
  return r.neckClosure >= E.sealedAt && r.residualNeckMm <= E.residualWarnMm && r.icaStenosis <= E.stenosisWarn && r.pcomPatent && r.achaPatent
    ? 'good' : 'partial';
}

/** Full-screen debrief card. */
export function showDebrief(host: HTMLElement, opTime: number, onBack: () => void): void {
  host.querySelector('.debrief')?.remove();
  const r = state.clipResult;
  const occ = state.tempClip.totalSeconds + (state.tempClip.applied ? state.time - state.tempClip.since : 0);
  const verdict = clipVerdict();
  const stagesDone = state.complete ? STAGES.length : state.stage;
  const row = (k: string, v: string, cls = '') => `<div class="dr ${cls}"><span>${t(k)}</span><b class="mono">${v}</b></div>`;
  const bad = (b: boolean) => (b ? 'bad' : 'ok');
  const el = document.createElement('div');
  el.className = 'debrief start';
  el.innerHTML = `
    <div class="card panel">
      <h1>${t('debriefTitle')}</h1>
      <div class="verdict ${verdict}">${t(verdict === 'good' ? 'verdictGood' : verdict === 'partial' ? 'verdictPartial' : 'verdictNone')}</div>
      <div class="dgrid">
        <div>
          ${row('dTime', fmt(opTime))}
          ${row('dEbl', `${Math.round(state.vitals.ebl)} ml`, state.vitals.ebl > 250 ? 'bad' : 'ok')}
          ${row('dOcclusion', fmt(occ), bad(occ > SIM.vitals.safeOcclusionS))}
          ${row('dRupture', state.ruptured ? t('yes') : t('no'), bad(state.ruptured))}
          ${row('dMep', `${Math.round(state.vitals.minMep)}%`, bad(state.vitals.minMep < 75))}
          ${row('dStages', `${stagesDone}/${STAGES.length}`)}
        </div>
        <div>
          <div class="dh">${t('dClip')}</div>
          ${r ? `
            ${row('dNeck', `${Math.round(r.neckClosure * 100)}%`, bad(r.neckClosure < SIM.eval.sealedAt))}
            ${row('dResidual', `${r.residualNeckMm.toFixed(1)} mm`, bad(r.residualNeckMm > SIM.eval.residualWarnMm))}
            ${row('dStenosis', `${Math.round(r.icaStenosis * 100)}%`, bad(r.icaStenosis > SIM.eval.stenosisWarn))}
            ${row('dPcom', r.pcomPatent && !state.occluded.has('pcom') ? t('open') : t('occluded'), bad(!r.pcomPatent || state.occluded.has('pcom')))}
            ${row('dAcha', r.achaPatent && !state.occluded.has('acha') ? t('open') : t('occluded'), bad(!r.achaPatent || state.occluded.has('acha')))}
          ` : `<p class="say">${t('noClip')}</p>`}
        </div>
      </div>
      <h2>${t('dTips')}</h2>
      <ul class="tips">${debriefTips().map(x => `<li>${x}</li>`).join('')}</ul>
      <div class="row">
        <button class="primary" data-act="restart">${t('dRestart')}</button>
        <button class="secondary" data-act="back">${t('dContinue')}</button>
      </div>
    </div>`;
  host.appendChild(el);
  applyI18n(el);
  el.addEventListener('click', e => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === 'restart') location.reload();
    if (act === 'back') { el.remove(); onBack(); }
  });
}
