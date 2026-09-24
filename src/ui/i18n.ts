import { bus, type Lang } from '../core/events';

/** All user-facing strings, English and Japanese. Add keys to both. */
const DICT = {
  en: {
    title: 'IC-PC Aneurysm Clipping',
    subtitle: 'Right internal carotid – posterior communicating artery aneurysm · pterional transsylvian approach',
    disclaimerTitle: 'Educational demonstration only',
    disclaimer:
      'This simulator is for education and demonstration. It is not a clinical training device, is not validated, and does not provide medical advice. Anatomy and physiology are simplified.',
    start: 'Start',
    demo: 'Demo mode',
    demoSoon: 'Demo mode arrives in a later milestone — starting free view.',
    controls: 'Controls',
    ctlZoom: 'Mouse wheel — magnification',
    ctlPan: 'Right drag — move the field',
    ctlTilt: 'Middle drag / Alt + drag — tilt the microscope',
    ctlFocus: 'F — focus on point under cursor · R — reset view',
    ctlLabels: 'L — anatomy labels · O / P — close / open fissure',
    attribution: 'Anatomy meshes: BodyParts3D (DBCLS, CC BY-SA 2.1 JP) via Z-Anatomy (CC BY-SA 4.0), modified.',
    mag: 'MAG',
    labels: 'Labels',
    opening: 'Fissure',
    lang: '日本語',
    // anatomy labels
    'a.ica': 'Internal carotid artery',
    'a.m1': 'M1 (MCA)',
    'a.a1': 'A1 (ACA)',
    'a.pcom': 'Posterior communicating a.',
    'a.acha': 'Anterior choroidal a.',
    'a.aneurysm': 'IC-PC aneurysm',
    'a.opticNerve': 'Optic nerve',
    'a.oculomotor': 'Oculomotor nerve (III)',
    'a.frontal': 'Frontal lobe',
    'a.temporal': 'Temporal lobe',
  },
  ja: {
    title: 'IC-PC 動脈瘤クリッピング',
    subtitle: '右内頸動脈–後交通動脈分岐部動脈瘤 · 前頭側頭開頭 経シルビウス裂アプローチ',
    disclaimerTitle: '教育・デモンストレーション専用',
    disclaimer:
      'このシミュレーターは教育およびデモンストレーション目的のものです。臨床トレーニング機器ではなく、検証もされておらず、医学的助言を提供するものではありません。解剖と生理は簡略化されています。',
    start: '開始',
    demo: 'デモモード',
    demoSoon: 'デモモードは後のマイルストーンで実装予定です。フリービューで開始します。',
    controls: '操作方法',
    ctlZoom: 'マウスホイール — 倍率',
    ctlPan: '右ドラッグ — 視野の移動',
    ctlTilt: '中ドラッグ / Alt + ドラッグ — 顕微鏡の傾き',
    ctlFocus: 'F — カーソル位置にフォーカス · R — 視野リセット',
    ctlLabels: 'L — 解剖ラベル · O / P — シルビウス裂を閉じる / 開く',
    attribution: '解剖メッシュ: BodyParts3D (DBCLS, CC BY-SA 2.1 JP)、Z-Anatomy (CC BY-SA 4.0) 経由・改変。',
    mag: '倍率',
    labels: 'ラベル',
    opening: 'シルビウス裂',
    lang: 'English',
    'a.ica': '内頸動脈',
    'a.m1': 'M1（中大脳動脈）',
    'a.a1': 'A1（前大脳動脈）',
    'a.pcom': '後交通動脈',
    'a.acha': '前脈絡叢動脈',
    'a.aneurysm': 'IC-PC 動脈瘤',
    'a.opticNerve': '視神経',
    'a.oculomotor': '動眼神経（III）',
    'a.frontal': '前頭葉',
    'a.temporal': '側頭葉',
  },
} satisfies Record<Lang, Record<string, string>>;

export type I18nKey = keyof (typeof DICT)['en'];

let lang: Lang = 'en';

export function t(key: I18nKey | string): string {
  const d = DICT[lang] as Record<string, string>;
  return d[key] ?? (DICT.en as Record<string, string>)[key] ?? key;
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
  applyI18n(document.body);
  bus.emit('lang', l);
}

/** Fill every element carrying data-i18n="key" with the translated text. */
export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n!);
  });
}
