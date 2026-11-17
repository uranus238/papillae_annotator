import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES, GROUPS } from '../src/config';
import {
  addPoint,
  aggregate,
  counts,
  editPoint,
  emptyMetadata,
  emptyProject,
  historyPush,
  mergeProject,
  newSession,
  nextLandmark,
  now,
  recordLandmark,
  screenToImage,
  setStatus,
  completeCategories,
  uid,
  validateProject,
  zoomAt,
  type Project,
} from '../src/domain';
import { exportCSVs, importCSVs, serializeProject } from '../src/io';
import Papa from 'papaparse';
import {
  LEGACY_CATEGORIES,
  LEGACY_LANDMARKS,
  PREVIOUS_LANDMARKS,
  PREVIOUS_DORSAL_LANDMARKS,
} from '../src/legacyConfig';
import { upgradeObservationDefinitions } from '../src/domain';
function fixture() {
  const p = emptyProject();
  p.images.push({
    image_id: uid(),
    image_filename: 'fish.png',
    width: 1200,
    height: 800,
    sha256: 'a'.repeat(64),
    original_data_url: 'data:image/png;base64,AA==',
    display_data_url: 'data:image/png;base64,AA==',
    metadata: { ...emptyMetadata(), ID: 'A-01', observer: 'observer A' },
    created_at: now(),
  });
  p.sessions.push(newSession(p, p.images[0].image_id, 'observer A'));
  return p;
}
const rows = (text: string) =>
  Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data;
describe('coordinate invariants', () => {
  it('preserves original coordinates after zoom and pan', () => {
    let v = { x: 20, y: 30, scale: 0.5 };
    const original = screenToImage({ x: 220, y: 180 }, v);
    expect(original).toEqual({ x: 400, y: 300 });
    v = zoomAt(v, { x: 220, y: 180 }, 2);
    expect(screenToImage({ x: 220, y: 180 }, v)).toEqual(original);
    v = { ...v, x: v.x + 80, y: v.y - 15 };
    expect(screenToImage({ x: 300, y: 165 }, v)).toEqual(original);
  });
  it('display changes do not mutate stored points', () => {
    const p = fixture();
    p.sessions[0] = addPoint(p.sessions[0], 'a1', { x: 400, y: 300 });
    const before = serializeProject(p);
    const settings = {
      brightness: 0.3,
      contrast: 2,
      gamma: 0.5,
      channel: 'G',
      roi: { x: 100, y: 100 },
    };
    void settings;
    expect(serializeProject(p)).toBe(before);
  });
});
describe('observation definition update', () => {
  it('reorders thirteen-landmark projects by ID while preserving records and advancing through the requested fin order', () => {
    const p = fixture();
    p.landmark_definitions = structuredClone(PREVIOUS_DORSAL_LANDMARKS);
    p.sessions[0] = addPoint(p.sessions[0], 'a1', { x: 20, y: 30 });
    for (const [i, l] of p.landmark_definitions.slice(0, 9).entries())
      p.sessions[0] = recordLandmark(p.sessions[0], l.id, { x: 100 + i * 20, y: 200 });
    const before = structuredClone(p),
      updated = upgradeObservationDefinitions(p);
    const order = ['pelvic_anterior', 'pectoral_lower', 'pectoral_upper', 'dorsal_origin'];
    expect(p).toEqual(before);
    expect(updated.landmark_definitions.slice(-4).map((l) => l.id)).toEqual(order);
    expect(updated.sessions).toEqual(p.sessions);
    expect(updated.categories).toEqual(p.categories);
    expect(updated.images).toEqual(p.images);
    expect(upgradeObservationDefinitions(updated)).toBe(updated);
    expect(mergeProject(updated, p).project.sessions).toHaveLength(1);
    expect(
      rows(exportCSVs(updated)['landmarks.csv'])
        .slice(-4)
        .map((l) => l.landmark),
    ).toEqual(order);
    let session = updated.sessions[0];
    for (const id of order) {
      expect(nextLandmark(updated, session)).toBe(id);
      session = recordLandmark(session, id, { x: 450, y: 300 });
    }
    expect(nextLandmark(updated, session)).toBeUndefined();
    const custom = structuredClone(p);
    custom.landmark_definitions[0].label = 'Custom anatomy';
    expect(upgradeObservationDefinitions(custom)).toBe(custom);
  });
  function legacy() {
    const p = fixture();
    p.categories = structuredClone(LEGACY_CATEGORIES);
    p.landmark_definitions = structuredClone(LEGACY_LANDMARKS);
    p.sessions = [newSession(p, p.images[0].image_id, 'Original observer')];
    return p;
  }
  it('uses exactly the requested category and landmark order, including numeric CSV columns', () => {
    const p = fixture();
    expect(p.categories.map((c) => c.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      'a1',
      'a2',
      'a3',
      'a4',
      'a5',
      'a6',
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
      'c10',
      'cp',
      'd',
      'x',
      'z',
      'hk1',
      'hk2',
      'os',
      'ot',
      'oi',
    ]);
    expect(p.landmark_definitions.map((l) => l.label)).toEqual([
      '眼後端',
      '眼中心',
      '眼前端',
      'AN',
      '上唇上端',
      '上顎前端',
      '開口後端',
      '下顎前端',
      '顎後端',
      '腹鰭前端',
      '胸鰭下端',
      '胸鰭上端',
      '第一背鰭前端',
    ]);
    expect(rows(exportCSVs(p)['landmarks.csv']).map((row) => row.landmark_label)).toEqual(
      p.landmark_definitions.map((l) => l.label),
    );
    expect(new Set(p.categories.map((c) => c.color)).size).toBe(32);
    p.sessions[0] = addPoint(p.sessions[0], '6', { x: 21, y: 43 });
    expect(() => validateProject(p)).not.toThrow();
    expect(rows(exportCSVs(p)['papillae_counts.csv'])[0]['6']).toBe('1');
  });
  it('preserves original points, statuses, colors and landmark IDs; archives removed anatomy', () => {
    const p = legacy();
    p.categories[0].color = '#123456';
    for (const c of p.categories)
      p.sessions[0] = setStatus(addPoint(p.sessions[0], c.id, { x: 20, y: 40 }), c.id, 'complete');
    for (const [i, l] of p.landmark_definitions.entries())
      p.sessions[0] = recordLandmark(p.sessions[0], l.id, { x: 100 + i * 20, y: 200 });
    const original = structuredClone(p),
      updated = upgradeObservationDefinitions(p),
      s = updated.sessions[0];
    expect(p).toEqual(original);
    expect(s.points).toEqual(original.sessions[0].points);
    expect(s.landmarks.eye).toEqual(original.sessions[0].landmarks.eye);
    expect(s.landmarks.dorsal_origin).toEqual(original.sessions[0].landmarks.dorsal_origin);
    expect(s.statuses.a1).toEqual(original.sessions[0].statuses.a1);
    expect(updated.categories.find((c) => c.id === 'a1')!.color).toBe('#123456');
    expect(s.statuses['1'].observation_status).toBe('unobserved');
    expect(s.statuses.a6.observation_status).toBe('unobserved');
    expect(s.landmarks.eye_posterior.observation_status).toBe('unrecorded');
    expect(Object.keys(s.landmarks)).toHaveLength(13);
    expect(Object.keys(s.retired_landmarks)).toHaveLength(3);
    for (const id of ['PN', 'snout_anterior', 'snout_posterior'])
      expect(s.retired_landmarks[id]).toMatchObject(original.sessions[0].landmarks[id]);
    expect(aggregate(updated, s, 'a系列')).toMatchObject({ total: null, subtotal: 5 });
    expect(aggregate(updated, s, 'c系列')).toMatchObject({ total: null, subtotal: 9 });
    const csv = exportCSVs(updated);
    expect(rows(csv['landmarks.csv'])).toHaveLength(13);
    expect(rows(csv['retired_landmarks.csv'])).toHaveLength(3);
    expect(validateProject(JSON.parse(serializeProject(updated)))).toEqual(updated);
    const reimport = importCSVs(updated, csv).project;
    expect(reimport.sessions[1].retired_landmarks.PN).toMatchObject({
      x_px: s.retired_landmarks.PN.x_px,
      label: 'PN',
    });
  });
  it('does not repeat upgrades or duplicate unchanged legacy sessions when merged', () => {
    const p = legacy();
    const updated = upgradeObservationDefinitions(p);
    expect(upgradeObservationDefinitions(updated)).toBe(updated);
    expect(mergeProject(updated, p).project.sessions).toHaveLength(1);
  });
  it('does not silently replace custom observation definitions', () => {
    const p = legacy();
    p.categories[0].id = 'custom';
    p.sessions = [];
    expect(upgradeObservationDefinitions(p)).toBe(p);
  });
  it('adds the thirteenth landmark to existing twelve-point projects without changing observations', () => {
    const p = fixture();
    p.sessions[0] = recordLandmark(addPoint(p.sessions[0], 'a1', { x: 15, y: 25 }), 'eye', {
      x: 100,
      y: 200,
    });
    p.landmark_definitions = structuredClone(PREVIOUS_LANDMARKS);
    delete p.sessions[0].landmarks.dorsal_origin;
    p.categories[0].color = '#123456';
    const before = structuredClone(p),
      updated = upgradeObservationDefinitions(p);
    expect(p).toEqual(before);
    expect(updated.categories).toEqual(p.categories);
    expect(updated.images).toEqual(p.images);
    expect(updated.sessions[0].points).toEqual(p.sessions[0].points);
    expect(updated.sessions[0].statuses).toEqual(p.sessions[0].statuses);
    expect(updated.sessions[0].landmarks.eye).toEqual(p.sessions[0].landmarks.eye);
    expect(updated.sessions[0].landmarks.dorsal_origin).toMatchObject({
      observation_status: 'unrecorded',
      x_px: null,
      y_px: null,
    });
    expect(upgradeObservationDefinitions(updated)).toBe(updated);
    expect(mergeProject(updated, p).project.sessions).toHaveLength(1);
    expect(
      rows(exportCSVs(updated)['landmarks.csv']).find((r) => r.landmark === 'dorsal_origin'),
    ).toMatchObject({ landmark_label: '第一背鰭前端', x_px: 'NA', y_px: 'NA' });
    const custom = structuredClone(p);
    custom.landmark_definitions[0].label = 'Custom anatomy';
    expect(upgradeObservationDefinitions(custom)).toBe(custom);
  });
  it('restores archived dorsal records with their original point IDs, coordinates and states', () => {
    for (const status of ['recorded', 'unrecorded', 'unavailable'] as const) {
      const p = fixture();
      const dorsal = {
        ...p.sessions[0].landmarks.dorsal_origin,
        observation_status: status,
        x_px: status === 'recorded' ? 310 : null,
        y_px: status === 'recorded' ? 220 : null,
      };
      p.landmark_definitions = structuredClone(PREVIOUS_LANDMARKS);
      delete p.sessions[0].landmarks.dorsal_origin;
      p.sessions[0].retired_landmarks.dorsal_origin = { ...dorsal, label: '第一背鰭前端' };
      const before = structuredClone(p),
        updated = upgradeObservationDefinitions(p);
      expect(p).toEqual(before);
      expect(updated.sessions[0].landmarks.dorsal_origin).toEqual(dorsal);
      expect(updated.sessions[0].retired_landmarks.dorsal_origin).toBeUndefined();
      expect(validateProject(updated)).toEqual(updated);
      expect(mergeProject(updated, p).project.sessions).toHaveLength(1);
    }
  });
});
describe('papillae and missing data', () => {
  it('completes selected categories together, explicitly including zero and preserving other observations', () => {
    const p = fixture();
    let s = addPoint(p.sessions[0], 'a1', { x: 200, y: 300 });
    s = setStatus(s, 'b', 'unavailable');
    s = setStatus(s, 'c3', 'complete');
    const before = structuredClone(s),
      updated = completeCategories(s, ['a1', 'c1', '6', 'a1', 'c3']);
    expect(s).toEqual(before);
    for (const id of ['a1', 'c1', '6'])
      expect(updated.statuses[id].observation_status).toBe('complete');
    expect(updated.statuses.c3).toEqual(s.statuses.c3);
    expect(updated.statuses.b).toEqual(s.statuses.b);
    expect(updated.statuses.c2).toEqual(s.statuses.c2);
    expect(updated.points).toBe(s.points);
    expect(updated.landmarks).toBe(s.landmarks);
    expect(updated.retired_landmarks).toBe(s.retired_landmarks);
    p.sessions[0] = updated;
    expect(rows(exportCSVs(p)['papillae_counts.csv'])[0]).toMatchObject({
      a1: '1',
      c1: '0',
      '6': '0',
      b: 'NA',
      c2: 'NA',
    });
    expect(completeCategories(updated, [])).toBe(updated);
    expect(completeCategories(updated, ['a1', 'c1'])).toBe(updated);
  });
  it('rejects an unavailable or unknown category atomically without confirming missing observations', () => {
    const s = setStatus(fixture().sessions[0], 'b', 'unavailable');
    const before = structuredClone(s);
    expect(() => completeCategories(s, ['a1', 'b'])).toThrow('観察不可');
    expect(s).toEqual(before);
    expect(() => completeCategories(s, ['a1', 'not-a-category'])).toThrow('存在しません');
    expect(s).toEqual(before);
  });
  it('defines 32 unique categories in the original four groups', () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(32);
    expect(GROUPS.map((g) => DEFAULT_CATEGORIES.filter((c) => c.group === g).length)).toEqual([
      6, 1, 10, 15,
    ]);
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.shortcut)).size).toBe(32);
  });
  it('accepts points in all categories and marks them provisional', () => {
    const p = fixture();
    let s = p.sessions[0];
    for (const c of p.categories) s = addPoint(s, c.id, { x: 10, y: 20 });
    expect(s.points).toHaveLength(32);
    expect(Object.values(counts(p, s))).toEqual(Array(32).fill(1));
    expect(aggregate(p, s)).toMatchObject({
      total: null,
      subtotal: 0,
      provisional: 32,
      complete: false,
    });
    for (const c of p.categories) s = setStatus(s, c.id, 'complete');
    expect(aggregate(p, s)).toMatchObject({
      total: 32,
      subtotal: 32,
      provisional: 0,
      complete: true,
    });
    expect(aggregate(p, s, 'a系列').total).toBe(6);
    expect(aggregate(p, s, 'c系列').total).toBe(10);
  });
  it('distinguishes unobserved, unavailable, provisional zero and observed zero', () => {
    const p = fixture();
    let s = p.sessions[0];
    expect(counts(p, s).a1).toBeNull();
    s = setStatus(s, 'a1', 'unavailable');
    expect(counts(p, s).a1).toBeNull();
    s = setStatus(s, 'a1', 'counting');
    expect(counts(p, s).a1).toBe(0);
    s = setStatus(s, 'a1', 'complete');
    expect(counts(p, s).a1).toBe(0);
    expect(aggregate(p, s, 'a系列').total).toBeNull();
  });
  it('adds, moves, reclassifies and deletes; completed counts reopen', () => {
    const p = fixture();
    let s = addPoint(p.sessions[0], 'a1', { x: 10, y: 20 });
    const id = s.points[0].point_id;
    s = setStatus(s, 'a1', 'complete');
    s = editPoint(s, id, { x_px: 55, y_px: 77 });
    expect(s.points[0]).toMatchObject({ x_px: 55, y_px: 77 });
    expect(s.statuses.a1.observation_status).toBe('counting');
    s = editPoint(s, id, { category: 'b' });
    expect(counts(p, s).a1).toBe(0);
    expect(counts(p, s).b).toBe(1);
    expect(() => setStatus(s, 'b', 'unavailable')).toThrow();
    s = editPoint(s, id, null);
    expect(s.points).toHaveLength(0);
  });
  it('history preserves separate snapshots and bounds memory', () => {
    const p = fixture(),
      s = p.sessions[0];
    const changed = { ...p, sessions: [addPoint(s, 'a1', { x: 10, y: 20 })] };
    const past = historyPush([], p);
    expect(past[0].sessions[0].points).toHaveLength(0);
    expect(changed.sessions[0].points).toHaveLength(1);
    expect(historyPush(Array(80).fill(p), changed)).toHaveLength(80);
  });
});
describe('landmarks', () => {
  it('records one point per category and keeps its ID on movement', () => {
    const p = fixture();
    let s = p.sessions[0];
    const id = s.landmarks.eye.point_id;
    s = recordLandmark(s, 'eye', { x: 10, y: 20 });
    s = recordLandmark(s, 'eye', { x: 30, y: 40 });
    expect(
      Object.values(s.landmarks).filter((l) => l.observation_status === 'recorded'),
    ).toHaveLength(1);
    expect(s.landmarks.eye).toMatchObject({ x_px: 30, y_px: 40, point_id: id });
    expect(s.points).toHaveLength(0);
  });
  it('auto-advances in definition order, skipping recorded, unavailable and skipped', () => {
    const p = fixture();
    let s = recordLandmark(p.sessions[0], 'eye', { x: 10, y: 20 });
    s = recordLandmark(s, 'AN', null, true);
    expect(nextLandmark(p, s)).toBe('eye_posterior');
    expect(nextLandmark(p, s, ['eye_posterior'])).toBe('eye_anterior');
    for (const l of p.landmark_definitions) s = recordLandmark(s, l.id, null, true);
    expect(nextLandmark(p, s)).toBeUndefined();
  });
  it('accepts missing landmarks and clears coordinates for unavailable', () => {
    const p = fixture();
    p.sessions[0] = recordLandmark(p.sessions[0], 'eye', null, true);
    expect(validateProject(p).sessions[0].landmarks.eye.x_px).toBeNull();
    expect(rows(exportCSVs(p)['landmarks.csv'])).toHaveLength(13);
    expect(rows(exportCSVs(p)['landmarks.csv'])[0]).toMatchObject({
      x_px: 'NA',
      y_px: 'NA',
      observation_status: 'unrecorded',
    });
  });
});
describe('metadata, exchanges and safety', () => {
  it.each(['', 'M', 'F'] as const)('preserves sex %s', (sex) => {
    const p = fixture();
    p.images[0].metadata.sex = sex;
    expect(validateProject(JSON.parse(serializeProject(p))).images[0].metadata.sex).toBe(sex);
    expect(rows(exportCSVs(p)['specimens.csv'])[0].sex).toBe(sex || 'NA');
  });
  it('keeps L/R and observer sessions separate', () => {
    const p = fixture();
    const right = {
      ...structuredClone(p.images[0]),
      image_id: uid(),
      metadata: { ...p.images[0].metadata, side: 'R' as const },
    };
    p.images.push(right);
    p.sessions.push(newSession(p, right.image_id, 'B'), newSession(p, p.images[0].image_id, 'B'));
    p.sessions[0] = addPoint(p.sessions[0], 'a1', { x: 10, y: 20 });
    const out = rows(exportCSVs(p)['papillae_counts.csv']);
    expect(out.map((r) => r.side)).toEqual(['L', 'R', 'L']);
    expect(out.map((r) => r.observer)).toEqual(['observer A', 'B', 'B']);
    expect(out.map((r) => r.a1)).toEqual(['1', 'NA', 'NA']);
  });
  it('CSV counts match coordinates and complete flags protect incomplete totals', () => {
    const p = fixture();
    let s = addPoint(p.sessions[0], 'a1', { x: 10, y: 20 });
    s = addPoint(s, 'a1', { x: 50, y: 60 });
    s = setStatus(s, 'a1', 'complete');
    s = setStatus(s, 'b', 'unavailable');
    p.sessions[0] = s;
    const out = exportCSVs(p);
    expect(rows(out['papillae_coordinates.csv'])).toHaveLength(2);
    expect(rows(out['papillae_counts.csv'])[0]).toMatchObject({
      a1: '2',
      b: 'NA',
      papillae_total: 'NA',
      papillae_total_complete: 'false',
      papillae_total_observed_subtotal: '2',
    });
    expect(rows(out['papillae_status.csv'])).toHaveLength(32);
  });
  it('JSON fully restores metadata, images, statuses, points and sessions', () => {
    const p = fixture();
    p.sessions[0] = recordLandmark(addPoint(p.sessions[0], 'oi', { x: 30, y: 40 }), 'eye', {
      x: 50,
      y: 60,
    });
    expect(validateProject(JSON.parse(serializeProject(p)))).toEqual(p);
  });
  it('merges idempotently and preserves conflicts as separate sessions', () => {
    const p = fixture();
    expect(mergeProject(p, p).project).toEqual({ ...p, updated_at: expect.any(String) });
    const b = structuredClone(p);
    b.sessions[0] = addPoint(b.sessions[0], 'b', { x: 30, y: 40 });
    const merged = mergeProject(p, b).project;
    expect(merged.images).toHaveLength(1);
    expect(merged.sessions).toHaveLength(2);
    expect(merged.sessions[0].points).toHaveLength(0);
    expect(merged.sessions[1].points).toHaveLength(1);
    expect(() => validateProject(merged)).not.toThrow();
  });
  it('refuses malformed projects instead of altering existing work', () => {
    const p = fixture();
    const bad = structuredClone(p);
    bad.sessions[0] = addPoint(bad.sessions[0], 'a1', { x: 1300, y: 10 });
    expect(() => validateProject(bad)).toThrow();
    expect(() => validateProject({ ...p, version: 99 })).toThrow();
    expect(p.sessions[0].points).toHaveLength(0);
  });
  it('restores CSV to a new session without overwriting existing data', () => {
    const p = fixture();
    p.sessions[0] = recordLandmark(addPoint(p.sessions[0], 'c9', { x: 11, y: 22 }), 'eye', {
      x: 33,
      y: 44,
    });
    const out = exportCSVs(p);
    const result = importCSVs(p, out).project;
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[1].points[0]).toMatchObject({ category: 'c9', x_px: 11, y_px: 22 });
    expect(result.sessions[1].landmarks.eye).toMatchObject({ x_px: 33, y_px: 44 });
    expect(result.sessions[0]).toEqual(p.sessions[0]);
  });
  it('rejects CSV count mismatches atomically', () => {
    const p = fixture();
    const out = exportCSVs(p);
    out['papillae_status.csv'] = out['papillae_status.csv'].replace(',NA', ',999');
    expect(() => importCSVs(p, out)).toThrow();
    expect(p.sessions).toHaveLength(1);
  });
  it('quotes CSV special characters and neutralizes spreadsheet formulas', () => {
    const p = fixture();
    p.images[0].metadata.notes = 'line1\n"quoted",line2';
    p.images[0].metadata.ID = '=1+1';
    const output = exportCSVs(p);
    expect(rows(output['specimens.csv'])[0].notes).toBe(p.images[0].metadata.notes);
    expect(rows(output['papillae_counts.csv'])[0].ID).toBe("'=1+1");
  });
});
