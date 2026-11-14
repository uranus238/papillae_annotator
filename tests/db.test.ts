import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { ProjectDB } from '../src/db';
import { emptyProject } from '../src/domain';
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
it('rejects invalid persisted data without overwriting it', async () => {
  const db = new ProjectDB(`test-${crypto.randomUUID()}`);
  await db.projects.put({ key: 'current', project: { version: 99 } as never });
  await expect(db.load()).rejects.toThrow();
  expect((await db.projects.get('current'))?.project.version).toBe(99);
  await db.delete();
});
