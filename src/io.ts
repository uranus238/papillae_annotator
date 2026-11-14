import Papa from 'papaparse';
import JSZip from 'jszip';
import {
  aggregate,
  counts,
  mergeProject,
  now,
  uid,
  validateProject,
  type Project,
  type Session,
} from './domain';
import { importImage } from './images';
const csv = (rows: Record<string, unknown>[], columns?: string[]) =>
  '\uFEFF' + Papa.unparse(rows, { columns, escapeFormulae: true, newline: '\r\n' });
const NA = (v: unknown) => (v === null || v === undefined || v === '' ? 'NA' : v);
function identity(p: Project, s: Session) {
  const im = p.images.find((i) => i.image_id === s.image_id)!;
  return {
    ID: im.metadata.ID,
    side: im.metadata.side,
    image_id: s.image_id,
    annotation_session_id: s.annotation_session_id,
    observer: s.observer,
  };
}
export function exportCSVs(p: Project): Record<string, string> {
  const countRows = p.sessions.map((s) => {
    const row: Record<string, unknown> = { ...identity(p, s) };
    for (const [key, val] of Object.entries(counts(p, s))) row[key] = NA(val);
    for (const [label, group] of [
      ['a_total', 'a系列'],
      ['c_total', 'c系列'],
      ['papillae_total', undefined],
    ]) {
      const ag = aggregate(p, s, group);
      row[label!] = NA(ag.total);
      row[`${label}_complete`] = ag.complete;
      row[`${label}_observed_subtotal`] = ag.subtotal;
      row[`${label}_provisional`] = ag.provisional;
    }
    for (const c of p.categories) row[`${c.id}_status`] = s.statuses[c.id].observation_status;
    return row;
  });
  const coords = p.sessions.flatMap((s) => s.points.map((pt) => ({ ...identity(p, s), ...pt })));
  const statuses = p.sessions.flatMap((s) =>
    p.categories.map((c) => ({
      ...identity(p, s),
      category: c.id,
      ...s.statuses[c.id],
      count: NA(counts(p, s)[c.id]),
    })),
  );
  const landmarks = p.sessions.flatMap((s) =>
    p.landmark_definitions.map((l) => {
      const lm = s.landmarks[l.id];
      return { ...identity(p, s), ...lm, x_px: NA(lm.x_px), y_px: NA(lm.y_px) };
    }),
  );
  const specimens = p.images.map((im) => ({
    ...im.metadata,
    sex: NA(im.metadata.sex),
    SL_mm: NA(im.metadata.SL_mm),
    HL_mm: NA(im.metadata.HL_mm),
    pixel_size_um: NA(im.metadata.pixel_size_um),
    image_id: im.image_id,
    image_filename: im.image_filename,
    width: im.width,
    height: im.height,
    sha256: im.sha256,
  }));
  const base = ['ID', 'side', 'image_id', 'annotation_session_id', 'observer'];
  return {
    'papillae_counts.csv': csv(countRows, [
      ...base,
      ...p.categories.map((c) => c.id),
      'a_total',
      'a_total_complete',
      'a_total_observed_subtotal',
      'a_total_provisional',
      'c_total',
      'c_total_complete',
      'c_total_observed_subtotal',
      'c_total_provisional',
      'papillae_total',
      'papillae_total_complete',
      'papillae_total_observed_subtotal',
      'papillae_total_provisional',
      ...p.categories.map((c) => `${c.id}_status`),
    ]),
    'papillae_coordinates.csv': csv(coords, [...base, 'point_id', 'category', 'x_px', 'y_px']),
    'papillae_status.csv': csv(statuses, [
      ...base,
      'category',
      'observation_status',
      'updated_at',
      'count',
    ]),
    'landmarks.csv': csv(landmarks, [
      ...base,
      'point_id',
      'landmark',
      'x_px',
      'y_px',
      'observation_status',
      'updated_at',
    ]),
    'specimens.csv': csv(specimens, [
      'ID',
      'side',
      'observer',
      'species',
      'locality',
      'SL_mm',
      'HL_mm',
      'sex',
      'pixel_size_um',
      'notes',
      'image_id',
      'image_filename',
      'width',
      'height',
      'sha256',
    ]),
  };
}
export const serializeProject = (p: Project) => JSON.stringify(validateProject(p), null, 2);
export async function parseProject(text: string): Promise<Project> {
  const p = validateProject(JSON.parse(text));
  for (const image of p.images) {
    const blob = await fetch(image.original_data_url).then((r) => r.blob());
    const decoded = await importImage(new File([blob], image.image_filename, { type: blob.type }));
    if (decoded.image.sha256 !== image.sha256)
      throw new Error(`${image.image_filename}: 元画像のSHA-256が一致しません`);
    if (decoded.image.width !== image.width || decoded.image.height !== image.height)
      throw new Error(`${image.image_filename}: 元画像の寸法が一致しません`);
    image.display_data_url = decoded.image.display_data_url;
  }
  return p;
}
export function download(
  content: Blob | string,
  filename: string,
  type = 'text/plain;charset=utf-8',
) {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function zipBackup(p: Project) {
  const z = new JSZip();
  z.file('project.json', serializeProject(p));
  for (const [name, data] of Object.entries(exportCSVs(p))) z.file(name, data);
  for (const im of p.images)
    z.file(
      `images/${im.image_id}/${im.image_filename.replace(/[\\/]/g, '_')}`,
      im.original_data_url.split(',')[1],
      { base64: true },
    );
  z.file(
    'README.txt',
    'Papillae Annotator v1\nproject.json をアプリに読み込むと画像と全セッションを復元します。images/ は元ファイルです。CSVのNAは欠測です。計数中は暫定値で、完全合計には含めません。\n',
  );
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
export async function csvZip(p: Project) {
  const z = new JSZip();
  for (const [name, data] of Object.entries(exportCSVs(p))) z.file(name, data);
  return z.generateAsync({ type: 'blob' });
}
type Row = Record<string, string>;
function parseCsv(text: string): Row[] {
  const result = Papa.parse<Row>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length) throw new Error(`CSV構文: ${result.errors[0].message}`);
  return result.data;
}
// CSV imports target registered images and create fresh sessions, never overwrite work.
export function importCSVs(
  p: Project,
  files: Record<string, string>,
): { project: Project; report: string } {
  for (const required of ['papillae_status.csv', 'papillae_coordinates.csv', 'landmarks.csv'])
    if (!(required in files))
      throw new Error(`CSV復元には ${required} が必要です（画像は先に登録してください）`);
  const incoming = structuredClone(p);
  incoming.sessions = [];
  const sessions = new Map<string, Session>();
  const read = (name: string) => parseCsv(files[name] ?? '');
  const statusRows = read('papillae_status.csv');
  for (const row of statusRows) {
    const im = p.images.find((i) => i.image_id === row.image_id);
    if (!im) throw new Error(`画像ID ${row.image_id} が未登録です。JSONで画像を復元してください。`);
    if (row.ID !== im.metadata.ID || row.side !== im.metadata.side)
      throw new Error('個体ID/sideが登録画像と一致しません');
    const sid = row.annotation_session_id;
    if (!sid) throw new Error('セッションIDが必要です');
    if (!sessions.has(sid))
      sessions.set(sid, {
        annotation_session_id: uid(),
        image_id: im.image_id,
        observer: row.observer,
        created_at: now(),
        updated_at: now(),
        points: [],
        statuses: {},
        landmarks: {},
      });
    const s = sessions.get(sid)!;
    if (s.image_id !== row.image_id || s.observer !== row.observer)
      throw new Error('CSV内のセッション情報が一致しません');
    if (s.statuses[row.category]) throw new Error('CSVカテゴリ状態が重複しています');
    s.statuses[row.category] = {
      observation_status: row.observation_status as never,
      updated_at: row.updated_at,
    };
  }
  const sessionFor = (row: Row) => {
    const s = sessions.get(row.annotation_session_id);
    if (!s || s.image_id !== row.image_id || s.observer !== row.observer)
      throw new Error('座標CSVのセッションが一致しません');
    const im = p.images.find((i) => i.image_id === s.image_id)!;
    if (im.metadata.ID !== row.ID || im.metadata.side !== row.side)
      throw new Error('座標CSVの個体ID/sideが一致しません');
    return s;
  };
  const numeric = (value: string) => {
    if (value === undefined || value.trim() === '' || !Number.isFinite(Number(value)))
      throw new Error('CSVの座標が数値ではありません');
    return Number(value);
  };
  for (const row of read('papillae_coordinates.csv')) {
    const s = sessionFor(row);
    s.points.push({
      point_id: uid(),
      category: row.category,
      x_px: numeric(row.x_px),
      y_px: numeric(row.y_px),
    });
  }
  for (const row of read('landmarks.csv')) {
    const s = sessionFor(row);
    if (s.landmarks[row.landmark]) throw new Error('Landmark行が重複しています');
    s.landmarks[row.landmark] = {
      point_id: uid(),
      landmark: row.landmark,
      x_px: row.x_px === 'NA' ? null : numeric(row.x_px),
      y_px: row.y_px === 'NA' ? null : numeric(row.y_px),
      observation_status: row.observation_status as never,
      updated_at: row.updated_at,
    };
  }
  incoming.sessions = [...sessions.values()];
  validateProject(incoming);
  for (const row of statusRows) {
    const s = sessions.get(row.annotation_session_id)!;
    if (String(NA(counts(incoming, s)[row.category])) !== row.count)
      throw new Error('CSVの計数値と点数が一致しません');
  }
  return mergeProject(p, incoming);
}
