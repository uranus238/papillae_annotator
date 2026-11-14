export const GROUPS = ['a系列', 'b', 'c系列', 'その他'] as const;
export const LANDMARK_COLOR = '#ffe3a3';
export type Category = {
  id: string;
  group: (typeof GROUPS)[number];
  color: string;
  shortcut: string;
};
const ids = [
  'a1',
  'a2',
  'a3',
  'a4',
  'a5',
  'b',
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'c7',
  'c8',
  'c9',
  'cp',
  'd',
  'x',
  'z',
  'os',
  'ot',
  'oi',
];
const colors = [
  '#20b6aa',
  '#34c5a0',
  '#5fc993',
  '#88cc74',
  '#b2ce53',
  '#efbd56',
  '#56b5ed',
  '#69a1f1',
  '#818deb',
  '#9b7de0',
  '#b97bd7',
  '#cb79bc',
  '#de81a9',
  '#ec8d96',
  '#f4a080',
  '#ebaf68',
  '#ed9160',
  '#e87863',
  '#d96583',
  '#b57ecb',
  '#8baac6',
  '#8fb585',
];
export const DEFAULT_CATEGORIES: Category[] = ids.map((id, i) => ({
  id,
  group: GROUPS[i < 5 ? 0 : i === 5 ? 1 : i < 15 ? 2 : 3],
  color: colors[i],
  shortcut: '1234567890qwertyuiopasd'[i],
}));
export const DEFAULT_LANDMARKS = [
  { id: 'eye', label: 'eye · 眼の中心' },
  { id: 'AN', label: 'AN' },
  { id: 'PN', label: 'PN' },
  { id: 'snout_anterior', label: '吻前端' },
  { id: 'upper_lip', label: '上唇上端' },
  { id: 'snout_posterior', label: '吻後端' },
  { id: 'pectoral_upper', label: '胸鰭基部上端' },
  { id: 'pectoral_lower', label: '胸鰭基部下端' },
  { id: 'dorsal_origin', label: '第一背鰭前端' },
];
export const STATUS_LABEL = {
  unobserved: '未観察',
  counting: '計数中',
  complete: '計数完了',
  unavailable: '観察不可',
};
export const LM_LABEL = { unrecorded: '未記録', recorded: '記録済み', unavailable: '観察不可' };
