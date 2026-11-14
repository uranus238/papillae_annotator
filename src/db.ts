import Dexie, { type Table } from 'dexie';
import { validateProject, type Project } from './domain';
export class ProjectDB extends Dexie {
  projects!: Table<{ key: string; project: Project }, string>;
  constructor(name = 'papillae-annotator-v1') {
    super(name);
    this.version(1).stores({ projects: 'key' });
  }
  async load() {
    const row = await this.projects.get('current');
    return row ? validateProject(row.project) : undefined;
  }
  async save(project: Project) {
    await this.projects.put({ key: 'current', project });
  }
}
export const db = new ProjectDB();
