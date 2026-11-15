import Dexie, { type Table } from 'dexie';
import { upgradeObservationDefinitions, validateProject, type Project } from './domain';
export const OBSERVATION_BACKUP_KEY = 'before-observation-update-2026-11-15';
export class ProjectDB extends Dexie {
  projects!: Table<{ key: string; project: Project }, string>;
  constructor(name = 'papillae-annotator-v1') {
    super(name);
    this.version(1).stores({ projects: 'key' });
  }
  async load() {
    const row = await this.projects.get('current');
    if (!row) return undefined;
    const original = validateProject(row.project),
      upgraded = upgradeObservationDefinitions(original);
    if (upgraded !== original)
      await this.transaction('rw', this.projects, async () => {
        if (!(await this.projects.get(OBSERVATION_BACKUP_KEY)))
          await this.projects.put({ key: OBSERVATION_BACKUP_KEY, project: original });
        await this.projects.put({ key: 'current', project: upgraded });
      });
    return upgraded;
  }
  async save(project: Project) {
    await this.projects.put({ key: 'current', project });
  }
}
export const db = new ProjectDB();
