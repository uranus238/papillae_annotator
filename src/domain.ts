import { z } from 'zod';
import { DEFAULT_CATEGORIES, DEFAULT_LANDMARKS, GROUPS } from './config';
import {
  LEGACY_CATEGORIES,
  LEGACY_LANDMARKS,
  PREVIOUS_LANDMARKS,
  PREVIOUS_DORSAL_LANDMARKS,
} from './legacyConfig';

const finite = z.number().finite();
const id = z.string().min(1).max(200);
const timestamp = z.string().datetime();
export const categorySchema = z.object({
  id,
  group: z.enum(GROUPS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  shortcut: z.string().regex(/^[a-z0-9]$/),
});
const metadataSchema = z.object({
  ID: z.string(),
  side: z.enum(['L', 'R']),
  observer: z.string(),
  species: z.string(),
  locality: z.string(),
  SL_mm: finite.nonnegative().nullable(),
  HL_mm: finite.nonnegative().nullable(),
  sex: z.enum(['', 'M', 'F']),
  pixel_size_um: finite.positive().nullable(),
  notes: z.string(),
});
const pointSchema = z.object({
  point_id: id,
  category: id,
  x_px: finite.nonnegative(),
  y_px: finite.nonnegative(),
});
const categoryStateSchema = z.object({
  observation_status: z.enum(['unobserved', 'counting', 'complete', 'unavailable']),
  updated_at: timestamp,
});
const landmarkSchema = z.object({
  point_id: id,
  landmark: id,
  x_px: finite.nonnegative().nullable(),
  y_px: finite.nonnegative().nullable(),
  observation_status: z.enum(['unrecorded', 'recorded', 'unavailable']),
  updated_at: timestamp,
});
const sessionSchema = z.object({
  annotation_session_id: id,
  image_id: id,
  observer: z.string(),
  created_at: timestamp,
  updated_at: timestamp,
  points: z.array(pointSchema),
  statuses: z.record(z.string(), categoryStateSchema),
  landmarks: z.record(z.string(), landmarkSchema),
  retired_landmarks: z.record(z.string(), landmarkSchema.extend({ label: z.string() })).default({}),
});
const imageSchema = z.object({
  image_id: id,
  image_filename: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  original_data_url: z.string().regex(/^data:[^,]*;base64,/),
  display_data_url: z.string().regex(/^data:image\/(png|jpeg);base64,/),
  metadata: metadataSchema,
  created_at: timestamp,
});
export const projectSchema = z.object({
  format: z.literal('papillae-annotator'),
  version: z.literal(1),
  project_id: id,
  created_at: timestamp,
  updated_at: timestamp,
  categories: z.array(categorySchema).min(1),
  landmark_definitions: z.array(z.object({ id, label: z.string().min(1) })).min(1),
  images: z.array(imageSchema),
  sessions: z.array(sessionSchema),
});
export type Project = z.infer<typeof projectSchema>;
export type ImageRecord = Project['images'][number];
export type Session = Project['sessions'][number];
export type Point = Session['points'][number];
export type Status = Session['statuses'][string]['observation_status'];
export type Metadata = ImageRecord['metadata'];
export type XY = { x: number; y: number };
export type View = XY & { scale: number };
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function emptyProject(): Project {
  return {
    format: 'papillae-annotator',
    version: 1,
    project_id: uid(),
    created_at: now(),
    updated_at: now(),
    categories: structuredClone(DEFAULT_CATEGORIES),
    landmark_definitions: structuredClone(DEFAULT_LANDMARKS),
    images: [],
    sessions: [],
  };
}
export function emptyMetadata(): Metadata {
  return {
    ID: '',
    side: 'L',
    observer: '',
    species: '',
    locality: '',
    SL_mm: null,
    HL_mm: null,
    sex: '',
    pixel_size_um: null,
    notes: '',
  };
}
export function newSession(project: Project, image_id: string, observer: string): Session {
  return {
    annotation_session_id: uid(),
    image_id,
    observer,
    created_at: now(),
    updated_at: now(),
    points: [],
    statuses: Object.fromEntries(
      project.categories.map((c) => [
        c.id,
        { observation_status: 'unobserved', updated_at: now() },
      ]),
    ),
    landmarks: Object.fromEntries(
      project.landmark_definitions.map((c) => [
        c.id,
        {
          point_id: uid(),
          landmark: c.id,
          x_px: null,
          y_px: null,
          observation_status: 'unrecorded',
          updated_at: now(),
        },
      ]),
    ),
    retired_landmarks: {},
  };
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`${label}に重複があります`);
}
export function validateProject(value: unknown): Project {
  const p = projectSchema.parse(value);
  unique(
    p.categories.map((c) => c.id),
    'カテゴリID',
  );
  unique(
    p.categories.map((c) => c.shortcut),
    'ショートカット',
  );
  unique(
    p.landmark_definitions.map((l) => l.id),
    'Landmark ID',
  );
  unique(
    p.images.map((i) => i.image_id),
    '画像ID',
  );
  unique(
    p.sessions.map((s) => s.annotation_session_id),
    'セッションID',
  );
  const reserved = new Set([
    'ID',
    'side',
    'image_id',
    'annotation_session_id',
    'observer',
    'a_total',
    'c_total',
    'papillae_total',
  ]);
  if (p.categories.some((c) => reserved.has(c.id) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(c.id)))
    throw new Error('カテゴリIDが出力列と衝突するか、無効です');
  unique(
    [
      ...reserved,
      ...['a_total', 'c_total', 'papillae_total'].flatMap((k) => [
        `${k}_complete`,
        `${k}_observed_subtotal`,
        `${k}_provisional`,
      ]),
      ...p.categories.map((c) => c.id),
      ...p.categories.map((c) => `${c.id}_status`),
    ],
    'CSV出力列',
  );
  const pointIds: string[] = [];
  for (const s of p.sessions) {
    const im = p.images.find((i) => i.image_id === s.image_id);
    if (!im) throw new Error('セッションに対応する画像がありません');
    if (
      Object.keys(s.statuses).length !== p.categories.length ||
      Object.keys(s.landmarks).length !== p.landmark_definitions.length
    )
      throw new Error('観察状態の定義が一致しません');
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < im.width && y < im.height;
    for (const pt of s.points) {
      pointIds.push(pt.point_id);
      if (!p.categories.some((c) => c.id === pt.category) || !inside(pt.x_px, pt.y_px))
        throw new Error('孔器のカテゴリまたは座標が無効です');
    }
    for (const c of p.categories) {
      const state = s.statuses[c.id];
      if (!state) throw new Error('カテゴリの状態がありません');
      if (
        ['unobserved', 'unavailable'].includes(state.observation_status) &&
        s.points.some((pt) => pt.category === c.id)
      )
        throw new Error('未観察・観察不可のカテゴリに点があります');
    }
    for (const l of p.landmark_definitions) {
      const lm = s.landmarks[l.id];
      if (!lm || lm.landmark !== l.id) throw new Error('Landmark定義が一致しません');
      pointIds.push(lm.point_id);
      if (
        lm.observation_status === 'recorded'
          ? lm.x_px === null || lm.y_px === null || !inside(lm.x_px, lm.y_px)
          : lm.x_px !== null || lm.y_px !== null
      )
        throw new Error('Landmarkの状態と座標が不整合です');
    }
    for (const [key, lm] of Object.entries(s.retired_landmarks)) {
      pointIds.push(lm.point_id);
      if (
        key !== lm.landmark ||
        (lm.observation_status === 'recorded'
          ? lm.x_px === null || lm.y_px === null || !inside(lm.x_px, lm.y_px)
          : lm.x_px !== null || lm.y_px !== null)
      )
        throw new Error('保全した旧Landmarkの状態と座標が不整合です');
    }
  }
  unique(pointIds, '点ID');
  return p;
}
// Upgrade known standard definitions only; custom research definitions are kept intact.
export function upgradeObservationDefinitions(p: Project): Project {
  const initial =
    p.categories.length === LEGACY_CATEGORIES.length &&
    LEGACY_CATEGORIES.every((c) =>
      p.categories.some((old) => old.id === c.id && old.group === c.group),
    ) &&
    JSON.stringify(p.landmark_definitions) === JSON.stringify(LEGACY_LANDMARKS);
  const previous =
    p.categories.length === DEFAULT_CATEGORIES.length &&
    DEFAULT_CATEGORIES.every((c) =>
      p.categories.some((old) => old.id === c.id && old.group === c.group),
    ) &&
    [
      PREVIOUS_LANDMARKS,
      PREVIOUS_DORSAL_LANDMARKS,
      DEFAULT_LANDMARKS.filter((l) => l.id !== 'dorsal_origin'),
    ].some((definitions) => JSON.stringify(p.landmark_definitions) === JSON.stringify(definitions));
  if (!initial && !previous) return p;
  const upgraded: Project = {
    ...p,
    updated_at: now(),
    categories: previous
      ? p.categories
      : DEFAULT_CATEGORIES.map((c) => ({
          ...c,
          color: p.categories.find((old) => old.id === c.id)?.color ?? c.color,
        })),
    landmark_definitions: structuredClone(DEFAULT_LANDMARKS),
    sessions: p.sessions.map((s) => {
      const retired_landmarks = { ...s.retired_landmarks };
      for (const def of p.landmark_definitions)
        if (!DEFAULT_LANDMARKS.some((l) => l.id === def.id))
          retired_landmarks[def.id] = { ...s.landmarks[def.id], label: def.label };
      const restored = Object.fromEntries(
        DEFAULT_LANDMARKS.filter((l) => !s.landmarks[l.id] && retired_landmarks[l.id]).map((l) => {
          const { label: _label, ...landmark } = retired_landmarks[l.id];
          delete retired_landmarks[l.id];
          return [l.id, landmark];
        }),
      );
      return {
        ...s,
        statuses: Object.fromEntries(
          DEFAULT_CATEGORIES.map((c) => [
            c.id,
            s.statuses[c.id] ?? { observation_status: 'unobserved', updated_at: s.updated_at },
          ]),
        ),
        landmarks: Object.fromEntries(
          DEFAULT_LANDMARKS.map((l) => [
            l.id,
            s.landmarks[l.id] ??
              restored[l.id] ?? {
                point_id:
                  `migration_${s.annotation_session_id}_${l.id}`.length <= 200
                    ? `migration_${s.annotation_session_id}_${l.id}`
                    : uid(),
                landmark: l.id,
                x_px: null,
                y_px: null,
                observation_status: 'unrecorded',
                updated_at: s.updated_at,
              },
          ]),
        ),
        retired_landmarks,
      };
    }),
  };
  return validateProject(upgraded);
}
export function patchSession(p: Project, sid: string, fn: (s: Session) => Session): Project {
  return {
    ...p,
    updated_at: now(),
    sessions: p.sessions.map((s) =>
      s.annotation_session_id === sid ? { ...fn(s), updated_at: now() } : s,
    ),
  };
}
export function addPoint(s: Session, category: string, pos: XY): Session {
  return {
    ...s,
    points: [...s.points, { point_id: uid(), category, x_px: pos.x, y_px: pos.y }],
    statuses: { ...s.statuses, [category]: { observation_status: 'counting', updated_at: now() } },
  };
}
export function editPoint(
  s: Session,
  pid: string,
  change: Partial<Pick<Point, 'category' | 'x_px' | 'y_px'>> | null,
): Session {
  const original = s.points.find((pt) => pt.point_id === pid);
  if (!original) return s;
  const statuses = { ...s.statuses };
  for (const cat of new Set([original.category, change?.category ?? original.category]))
    statuses[cat] = { observation_status: 'counting', updated_at: now() };
  return {
    ...s,
    points: change
      ? s.points.map((pt) => (pt.point_id === pid ? { ...pt, ...change } : pt))
      : s.points.filter((pt) => pt.point_id !== pid),
    statuses,
  };
}
export function setStatus(s: Session, category: string, status: Status): Session {
  if (
    ['unobserved', 'unavailable'].includes(status) &&
    s.points.some((pt) => pt.category === category)
  )
    throw new Error('点が存在します。点を移動・削除してから状態を変更してください。');
  return {
    ...s,
    statuses: { ...s.statuses, [category]: { observation_status: status, updated_at: now() } },
  };
}
export function recordLandmark(
  s: Session,
  landmark: string,
  pos: XY | null,
  unavailable = false,
): Session {
  return {
    ...s,
    landmarks: {
      ...s.landmarks,
      [landmark]: {
        ...s.landmarks[landmark],
        x_px: pos?.x ?? null,
        y_px: pos?.y ?? null,
        observation_status: pos ? 'recorded' : unavailable ? 'unavailable' : 'unrecorded',
        updated_at: now(),
      },
    },
  };
}
export function nextLandmark(p: Project, s: Session, skipped: string[] = []): string | undefined {
  return p.landmark_definitions.find(
    (l) => s.landmarks[l.id].observation_status === 'unrecorded' && !skipped.includes(l.id),
  )?.id;
}
export function counts(p: Project, s: Session) {
  return Object.fromEntries(
    p.categories.map((c) => [
      c.id,
      ['unobserved', 'unavailable'].includes(s.statuses[c.id].observation_status)
        ? null
        : s.points.filter((pt) => pt.category === c.id).length,
    ]),
  );
}
export function aggregate(p: Project, s: Session, group?: string) {
  const cats = p.categories.filter((c) => !group || c.group === group);
  const completed = cats.filter((c) => s.statuses[c.id].observation_status === 'complete');
  const complete = cats.length > 0 && completed.length === cats.length;
  const subtotal = s.points.filter((pt) => completed.some((c) => c.id === pt.category)).length;
  const provisional = s.points.filter(
    (pt) =>
      cats.some((c) => c.id === pt.category) &&
      s.statuses[pt.category].observation_status === 'counting',
  ).length;
  return { total: complete ? subtotal : null, subtotal, provisional, complete };
}
export function screenToImage(pos: XY, v: View): XY {
  return { x: (pos.x - v.x) / v.scale, y: (pos.y - v.y) / v.scale };
}
export function zoomAt(v: View, pos: XY, scale: number): View {
  const im = screenToImage(pos, v);
  return { x: pos.x - im.x * scale, y: pos.y - im.y * scale, scale };
}
export function historyPush<T>(past: T[], current: T): T[] {
  return [...past, current].slice(-80);
}

// Import is additive: identical sessions are ignored; conflicting sessions get new IDs.
export function mergeProject(
  current: Project,
  incoming: Project,
): { project: Project; report: string } {
  const a = upgradeObservationDefinitions(validateProject(current)),
    b = upgradeObservationDefinitions(validateProject(incoming));
  if (
    JSON.stringify(a.categories) !== JSON.stringify(b.categories) ||
    JSON.stringify(a.landmark_definitions) !== JSON.stringify(b.landmark_definitions)
  )
    throw new Error('カテゴリ設定が異なります。共通設定を使用してください。');
  const p = structuredClone(a);
  const imageMap = new Map<string, string>();
  let duplicates = 0,
    conflicts = 0,
    added = 0;
  for (const image of b.images) {
    const same = p.images.find(
      (i) =>
        i.sha256 === image.sha256 &&
        i.metadata.ID === image.metadata.ID &&
        i.metadata.side === image.metadata.side &&
        JSON.stringify(i.metadata) === JSON.stringify(image.metadata),
    );
    if (same) {
      imageMap.set(image.image_id, same.image_id);
      duplicates++;
    } else {
      const copy = {
        ...image,
        image_id: p.images.some((i) => i.image_id === image.image_id) ? uid() : image.image_id,
      };
      p.images.push(copy);
      imageMap.set(image.image_id, copy.image_id);
    }
  }
  for (const session of b.sessions) {
    const copy = structuredClone(session);
    copy.image_id = imageMap.get(copy.image_id)!;
    const same = p.sessions.find((s) => s.annotation_session_id === copy.annotation_session_id);
    if (same && JSON.stringify(same) === JSON.stringify(copy)) continue;
    if (same) {
      copy.annotation_session_id = uid();
      conflicts++;
    }
    const used = new Set(
      p.sessions.flatMap((s) => [
        ...s.points.map((pt) => pt.point_id),
        ...Object.values(s.landmarks).map((l) => l.point_id),
        ...Object.values(s.retired_landmarks).map((l) => l.point_id),
      ]),
    );
    copy.points.forEach((pt) => {
      if (used.has(pt.point_id)) pt.point_id = uid();
    });
    Object.values(copy.landmarks).forEach((l) => {
      if (used.has(l.point_id)) l.point_id = uid();
    });
    Object.values(copy.retired_landmarks).forEach((l) => {
      if (used.has(l.point_id)) l.point_id = uid();
    });
    p.sessions.push(copy);
    added++;
  }
  p.updated_at = now();
  return {
    project: validateProject(p),
    report: `${added}セッション追加 / ${duplicates}画像を照合 / ${conflicts}競合を別セッションで保全`,
  };
}
