import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import {
  ProjectDB,
  OBSERVATION_BACKUP_KEY,
  DORSAL_BACKUP_KEY,
  LANDMARK_ORDER_BACKUP_KEY,
} from '../src/db';
import { emptyProject } from '../src/domain';
import {
  LEGACY_CATEGORIES,
  LEGACY_LANDMARKS,
  PREVIOUS_LANDMARKS,
  PREVIOUS_DORSAL_LANDMARKS,
} from '../src/legacyConfig';
it('restores an autosaved project after closing and reopening IndexedDB', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const p = emptyProject();
  const db = new ProjectDB(name);
  await db.save(p);
  db.close();
  const reopened = new ProjectDB(name);
  expect(await reopened.load()).toEqual(p);
  await reopened.delete();
});
it('backs up the prior thirteen-landmark order once without replacing existing migration backups', async () => {
  const db = new ProjectDB(`test-${crypto.randomUUID()}`);
  const p = emptyProject();
  p.landmark_definitions = structuredClone(PREVIOUS_DORSAL_LANDMARKS);
  await db.projects.put({ key: DORSAL_BACKUP_KEY, project: p });
  await db.save(p);
  const updated = await db.load();
  expect(updated!.landmark_definitions.slice(-4).map((l) => l.label)).toEqual([
    '腹鰭前端',
    '胸鰭下端',
    '胸鰭上端',
    '第一背鰭前端',
  ]);
  expect((await db.projects.get(LANDMARK_ORDER_BACKUP_KEY))!.project).toEqual(p);
  expect((await db.projects.get(DORSAL_BACKUP_KEY))!.project).toEqual(p);
  expect(await db.load()).toEqual(updated);
  expect((await db.projects.get(LANDMARK_ORDER_BACKUP_KEY))!.project).toEqual(p);
  await db.delete();
});
it('atomically keeps the pre-update snapshot and migrates stored standard projects only once', async () => {
  const db = new ProjectDB(`test-${crypto.randomUUID()}`);
  const p = emptyProject();
  p.categories = structuredClone(LEGACY_CATEGORIES);
  p.landmark_definitions = structuredClone(LEGACY_LANDMARKS);
  // No images are needed to verify the unchanged snapshot; session preservation is tested separately.
  await db.save(p);
  const updated = await db.load();
  expect(updated!.categories).toHaveLength(32);
  expect((await db.projects.get(OBSERVATION_BACKUP_KEY))!.project).toEqual(p);
  expect(await db.load()).toEqual(updated);
  expect((await db.projects.get(OBSERVATION_BACKUP_KEY))!.project).toEqual(p);
  await db.delete();
});
it('rejects invalid persisted data without overwriting it', async () => {
  const db = new ProjectDB(`test-${crypto.randomUUID()}`);
  await db.projects.put({ key: 'current', project: { version: 99 } as never });
  await expect(db.load()).rejects.toThrow();
  expect((await db.projects.get('current'))?.project.version).toBe(99);
  await db.delete();
});
it('backs up twelve-landmark data separately and keeps the earlier backup intact', async () => {
  const db = new ProjectDB(`test-${crypto.randomUUID()}`);
  const originalBackup = emptyProject();
  originalBackup.categories = structuredClone(LEGACY_CATEGORIES);
  originalBackup.landmark_definitions = structuredClone(LEGACY_LANDMARKS);
  await db.projects.put({ key: OBSERVATION_BACKUP_KEY, project: originalBackup });
  const p = emptyProject();
  p.landmark_definitions = structuredClone(PREVIOUS_LANDMARKS);
  await db.save(p);
  const updated = await db.load();
  expect(updated!.landmark_definitions).toHaveLength(13);
  expect((await db.projects.get(DORSAL_BACKUP_KEY))!.project).toEqual(p);
  expect((await db.projects.get(OBSERVATION_BACKUP_KEY))!.project).toEqual(originalBackup);
  expect(await db.load()).toEqual(updated);
  expect((await db.projects.get(DORSAL_BACKUP_KEY))!.project).toEqual(p);
  await db.delete();
});
