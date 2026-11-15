import { LEGACY_CATEGORIES } from './legacyConfig';
export const GROUPS = ['a系列', 'b', 'c系列', 'その他'] as const;
export const LANDMARK_COLOR = '#ffe3a3';
export type Category = {
  id: string;
  group: (typeof GROUPS)[number];
  color: string;
  shortcut: string;
};
const groups = [
  ['1', '2', '3', '4', '5', '6'],
  ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'],
  ['b'],
  ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'],
  ['cp', 'd', 'x', 'z', 'hk1', 'hk2', 'os', 'ot', 'oi'],
];
const categoryGroups: Category['group'][] = ['その他', 'a系列', 'b', 'c系列', 'その他'];
const addedColors: Record<string, string> = {
  '1': '#e74c3c',
  '2': '#ff7043',
  '3': '#ff9800',
  '4': '#f1c40f',
  '5': '#cddc39',
  '6': '#7cb342',
  a6: '#c4e538',
  c10: '#f6b26b',
  hk1: '#ab47bc',
  hk2: '#607d8b',
};
export const DEFAULT_CATEGORIES: Category[] = groups
  .flatMap((ids, i) =>
    ids.map((id) => ({
      id,
      group: categoryGroups[i],
      color: LEGACY_CATEGORIES.find((c) => c.id === id)?.color ?? addedColors[id],
      shortcut: '',
    })),
  )
  .map((c, i) => ({ ...c, shortcut: '123456qwertyuiopasdfghjklzxcvbnm'[i] }));
export const DEFAULT_LANDMARKS = [
  { id: 'eye_posterior', label: '眼後端' },
  { id: 'eye', label: '眼中心' },
  { id: 'eye_anterior', label: '眼前端' },
  { id: 'AN', label: 'AN' },
  { id: 'upper_lip', label: '上唇上端' },
  { id: 'upper_jaw_anterior', label: '上顎前端' },
  { id: 'mouth_posterior', label: '開口後端' },
  { id: 'lower_jaw_anterior', label: '下顎前端' },
  { id: 'jaw_posterior', label: '顎後端' },
  { id: 'pectoral_upper', label: '胸鰭上端' },
  { id: 'pectoral_lower', label: '胸鰭下端' },
  { id: 'pelvic_anterior', label: '腹鰭前端' },
];
export const STATUS_LABEL = {
  unobserved: '未観察',
  counting: '計数中',
  complete: '計数完了',
  unavailable: '観察不可',
};
export const LM_LABEL = { unrecorded: '未記録', recorded: '記録済み', unavailable: '観察不可' };
