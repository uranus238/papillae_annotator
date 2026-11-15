import { test, expect, type Page, type Download } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { LEGACY_CATEGORIES, LEGACY_LANDMARKS } from '../../src/legacyConfig';
import { DEFAULT_CATEGORIES, DEFAULT_LANDMARKS } from '../../src/config';
import { addPoint, newSession, recordLandmark, setStatus, type Project } from '../../src/domain';
async function data(d: Download) {
  const stream = await d.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}
async function dismiss(page: Page) {
  const b = page.getByRole('button', { name: '通知を閉じる' });
  if (await b.count()) await b.click();
}
async function output(page: Page, label = 'プロジェクト JSON') {
  await dismiss(page);
  await page.getByRole('button', { name: '書き出す', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: label }).click();
  return data(await download);
}
async function saved(page: Page): Promise<Project> {
  return JSON.parse((await output(page)).toString());
}
async function prepare(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await page.locator('input[type=file]').nth(0).setInputFiles(path.resolve('public/sample.png'));
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await expect(page.locator('.image-item')).toHaveCount(1);
  return saved(page);
}
function legacyProject(project: Project) {
  const p = structuredClone(project);
  p.categories = structuredClone(LEGACY_CATEGORIES);
  p.landmark_definitions = structuredClone(LEGACY_LANDMARKS);
  p.sessions = [newSession(p, p.images[0].image_id, 'Legacy observer')];
  p.sessions[0] = setStatus(addPoint(p.sessions[0], 'a1', { x: 123, y: 456 }), 'a1', 'complete');
  for (const [i, id] of [
    'eye',
    'PN',
    'snout_anterior',
    'snout_posterior',
    'dorsal_origin',
  ].entries())
    p.sessions[0] = recordLandmark(p.sessions[0], id, { x: 300 + i * 20, y: 200 });
  return p;
}
async function idbRead(page: Page, key: string) {
  return page.evaluate(
    async (key) =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open('papillae-annotator-v1');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const read = db.transaction('projects').objectStore('projects').get(key);
          read.onsuccess = () => {
            resolve(read.result?.project);
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
    key,
  );
}
test('legacy JSON keeps the original anatomy and new missing states, including exported archived coordinates', async ({
  page,
}) => {
  const legacy = legacyProject(await prepare(page));
  const sid = legacy.sessions[0].annotation_session_id;
  await dismiss(page);
  const file = {
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  };
  await page.locator('input[type=file]').nth(1).setInputFiles(file);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await page.getByLabel('セッション', { exact: true }).selectOption(sid);
  await page.getByRole('tab', { name: 'Landmark', exact: true }).click();
  await page.locator('.retired-landmarks summary').click();
  await expect(page.locator('.retired-landmarks')).toContainText(
    'PN：記録済み (320.00, 200.00 px)',
  );
  await expect(page.getByTestId('landmark-eye_posterior')).toHaveClass(/chosen/);
  expect(await page.locator('.landmark-button').count()).toBe(12);
  await expect(page.getByTestId('landmark-PN')).toHaveCount(0);
  let p = await saved(page);
  const s = p.sessions.find((s) => s.annotation_session_id === sid)!;
  expect(s.points).toEqual(legacy.sessions[0].points);
  expect(s.landmarks.eye).toEqual(legacy.sessions[0].landmarks.eye);
  expect(s.statuses['1'].observation_status).toBe('unobserved');
  expect(s.statuses.a6.observation_status).toBe('unobserved');
  expect(s.retired_landmarks.PN).toMatchObject(legacy.sessions[0].landmarks.PN);
  expect(Object.keys(s.retired_landmarks)).toHaveLength(4);
  const csv = await JSZip.loadAsync(await output(page, 'CSV 5種 ZIP'));
  expect(Object.keys(csv.files)).toHaveLength(6);
  const retired = Papa.parse<Record<string, string>>(
    await csv.file('retired_landmarks.csv')!.async('string'),
    { header: true, skipEmptyLines: true },
  ).data;
  expect(retired).toHaveLength(4);
  expect(retired.find((row) => row.landmark === 'PN')).toMatchObject({
    label: 'PN',
    x_px: '320',
    y_px: '200',
  });
  await dismiss(page);
  await page.locator('input[type=file]').nth(1).setInputFiles(file);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  p = await saved(page);
  expect(p.sessions).toHaveLength(2);
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  expect((await saved(page)).sessions).toEqual(p.sessions);
});
test('stored old definitions are migrated once with an intact pre-update backup', async ({
  page,
}) => {
  const legacy = legacyProject(await prepare(page));
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await page.evaluate(
    async (legacy) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('papillae-annotator-v1');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('projects', 'readwrite');
          tx.objectStore('projects').put({ key: 'current', project: legacy });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    legacy,
  );
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await expect(page.locator('.category-button')).toHaveCount(32);
  const p = await saved(page);
  expect(p.sessions[0].points).toEqual(legacy.sessions[0].points);
  expect(p.sessions[0].retired_landmarks.PN).toMatchObject(legacy.sessions[0].landmarks.PN);
  expect(await idbRead(page, 'before-observation-update-2026-11-15')).toEqual(legacy);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  expect((await saved(page)).sessions).toEqual(p.sessions);
  expect(await idbRead(page, 'before-observation-update-2026-11-15')).toEqual(legacy);
});
test('a Pages-style subdirectory serves the app and standalone guide, and guide tabs do not lock editing', async ({
  page,
  context,
}, info) => {
  const root = path.resolve('dist');
  const prefix = '/papillae_annotator/';
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) {
      res.writeHead(404).end();
      return;
    }
    const relative = pathname.slice(prefix.length) || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.setHeader(
        'Content-Type',
        file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : file.endsWith('.js')
            ? 'text/javascript'
            : file.endsWith('.css')
              ? 'text/css'
              : file.endsWith('.png')
                ? 'image/png'
                : 'application/octet-stream',
      );
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}${prefix}`;
  try {
    await page.goto(url);
    await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
    await expect(page.getByText('観察を、確かな記録に。')).toHaveCount(0);
    await expect(page.locator('.category-button')).toHaveCount(32);
    const popup = context.waitForEvent('page');
    await page.getByRole('link', { name: '使い方', exact: true }).click();
    const guide = await popup;
    await expect(guide).toHaveURL(url + 'help.html');
    await expect(guide.getByRole('heading', { name: '使い方', exact: true })).toBeVisible();
    expect(await guide.locator('.guide-category').count()).toBe(32);
    expect(await guide.locator('.guide-landmarks li').allTextContents()).toEqual(
      DEFAULT_LANDMARKS.map((l) => l.label),
    );
    expect(await guide.locator('.guide-category').allTextContents()).toHaveLength(
      DEFAULT_CATEGORIES.length,
    );
    await guide.screenshot({ path: info.outputPath('guide-desktop.png'), fullPage: true });
    await page.reload();
    await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
    await expect(page.locator('.locked-banner')).toHaveCount(0);
    await guide
      .getByRole('navigation', { name: '使い方の目次' })
      .getByRole('link', { name: /共同研究者/ })
      .click();
    await expect(
      guide.getByRole('heading', { name: '7. 共同研究者との共有', exact: true }),
    ).toBeInViewport();
    await guide.setViewportSize({ width: 390, height: 844 });
    await guide.goto(url + 'help.html');
    expect(await guide.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await guide.screenshot({ path: info.outputPath('guide-mobile.png'), fullPage: true });
    await guide.close();
  } finally {
    await server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
