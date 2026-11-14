import { test, expect, chromium, type Page, type Download } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import Papa from 'papaparse';
import type { Project } from '../../src/domain';
const sample = path.resolve('public/sample.png');
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});
async function noticeOff(page: Page) {
  const b = page.getByRole('button', { name: '通知を閉じる' });
  if (await b.count()) await b.click();
}
async function load(page: Page, file = sample) {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await page.locator('input[type=file]').nth(0).setInputFiles(file);
  await expect(page.locator('.image-item')).toHaveCount(1);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await expect(page.locator('.canvas-host canvas')).toHaveCount(2);
  await noticeOff(page);
}
async function fitView(page: Page) {
  const box = (await page.getByTestId('viewer').boundingBox())!;
  const scale = Math.min((box.width - 32) / 1200, (box.height - 32) / 800);
  return {
    x: box.x + (box.width - 1200 * scale) / 2,
    y: box.y + (box.height - 800 * scale) / 2,
    scale,
  };
}
async function clickOriginal(page: Page, x: number, y: number) {
  const v = await fitView(page);
  await page.mouse.click(v.x + x * v.scale, v.y + y * v.scale);
}
async function bytes(d: Download) {
  const stream = await d.createReadStream();
  const chunks: Buffer[] = [];
  for await (const b of stream!) chunks.push(Buffer.from(b));
  return Buffer.concat(chunks);
}
async function exportDownload(page: Page, label: string) {
  await noticeOff(page);
  await page.getByRole('button', { name: '書き出す', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: label }).click();
  return await download;
}
async function project(page: Page): Promise<Project> {
  return JSON.parse((await bytes(await exportDownload(page, 'プロジェクト JSON'))).toString());
}
const csvRows = (s: string) =>
  Papa.parse<Record<string, string>>(s, { header: true, skipEmptyLines: true }).data;
test('image click, all categories, missingness, CSV/JSON/PNG/ZIP and browser restart', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await load(page);
  await page.getByLabel('個体 ID *', { exact: true }).fill('QA-01');
  await page.getByLabel('計数者', { exact: true }).fill('Observer A');
  await page.getByLabel('sex', { exact: true }).selectOption('F');
  const categories = [
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
  for (const [i, c] of categories.entries()) {
    await page.getByTestId(`category-${c}`).click();
    await clickOriginal(page, 160 + i * 28, 460 + (i % 3) * 25);
    await expect(page.getByTestId(`category-${c}`).locator('strong')).toHaveText('1*');
    await page.getByRole('button', { name: '計数完了', exact: true }).click();
  }
  await expect(page.getByTestId('total-subtotal')).toHaveText('22 個');
  await page.getByRole('tab', { name: 'Landmark', exact: true }).click();
  await clickOriginal(page, 395, 325);
  await expect(page.getByTestId('landmark-eye')).toContainText('記録済み');
  await expect(page.getByTestId('landmark-AN')).toHaveClass(/chosen/);
  await page.getByRole('button', { name: '観察不可', exact: true }).click();
  await expect(page.getByTestId('landmark-PN')).toHaveClass(/chosen/);
  await page.getByRole('button', { name: 'スキップ', exact: true }).click();
  await expect(page.getByTestId('landmark-snout_anterior')).toHaveClass(/chosen/);
  await page.getByLabel('自動で次へ').uncheck();
  await clickOriginal(page, 175, 410);
  await expect(page.getByTestId('landmark-snout_anterior')).toHaveClass(/chosen/);
  await clickOriginal(page, 200, 400);
  await expect(page.getByRole('alert')).toContainText('記録済みです');
  await expect(page.getByRole('tab', { name: '編集', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  let p = await project(page);
  expect(p.sessions[0].points).toHaveLength(22);
  expect(p.sessions[0].landmarks.eye.observation_status).toBe('recorded');
  expect(p.sessions[0].landmarks.AN.observation_status).toBe('unavailable');
  expect(p.sessions[0].landmarks.PN.x_px).toBeNull();
  expect(p.images[0].metadata.sex).toBe('F');
  expect(p.sessions[0].observer).toBe('Observer A');
  const csv = await JSZip.loadAsync(await bytes(await exportDownload(page, 'CSV 5種 ZIP')));
  expect(Object.keys(csv.files)).toHaveLength(5);
  const row = csvRows(await csv.file('papillae_counts.csv')!.async('string'))[0];
  expect(row.papillae_total).toBe('22');
  expect(row.a_total).toBe('5');
  expect(row.c_total).toBe('9');
  expect(row.papillae_total_complete).toBe('true');
  expect(csvRows(await csv.file('papillae_coordinates.csv')!.async('string'))).toHaveLength(22);
  expect(csvRows(await csv.file('landmarks.csv')!.async('string'))).toHaveLength(9);
  await page.locator('.marker-settings summary').click();
  await page.getByLabel('不透明度').fill('1');
  // Annotated exports include all records even when the viewer overlay is hidden.
  await page.getByTitle('注釈の表示切り替え', { exact: true }).click();
  const pairZip = await JSZip.loadAsync(
    await bytes(await exportDownload(page, '注釈つき PNG 2種 ZIP')),
  );
  const names = Object.keys(pairZip.files);
  expect(names).toHaveLength(2);
  const onlyName = names.find((name) => name.endsWith('_papillae.png'))!;
  const withName = names.find((name) => name.endsWith('_with_landmarks.png'))!;
  const onlyPNG = await pairZip.file(onlyName)!.async('nodebuffer');
  const withPNG = await pairZip.file(withName)!.async('nodebuffer');
  for (const png of [onlyPNG, withPNG]) {
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(800);
  }
  await writeFile(info.outputPath('papillae_only.png'), onlyPNG);
  await writeFile(info.outputPath('papillae_with_landmarks.png'), withPNG);
  const recorded = Object.values(p.sessions[0].landmarks).filter(
    (l) => l.observation_status === 'recorded',
  );
  const positions = [...p.sessions[0].points, ...recorded].map((pt) => ({
    x: pt.x_px!,
    y: pt.y_px!,
  }));
  const samples = await page.evaluate(
    async ({ sources, positions }) => {
      const output: number[][][] = [];
      for (const src of sources) {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        output.push(
          positions.map((pt) =>
            Array.from(ctx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data).slice(0, 3),
          ),
        );
      }
      return output;
    },
    {
      sources: [
        `data:image/png;base64,${onlyPNG.toString('base64')}`,
        `data:image/png;base64,${withPNG.toString('base64')}`,
        p.images[0].display_data_url,
      ],
      positions,
    },
  );
  for (const [i, pt] of p.sessions[0].points.entries()) {
    const hex = p.categories.find((c) => c.id === pt.category)!.color;
    const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
    expect(samples[0][i]).toEqual(rgb);
    expect(samples[1][i]).toEqual(rgb);
  }
  for (let i = p.sessions[0].points.length; i < positions.length; i++) {
    expect(samples[1][i]).toEqual([255, 227, 163]);
    expect(samples[0][i]).toEqual(samples[2][i]);
  }
  expect(await bytes(await exportDownload(page, 'Papillaeのみ PNG'))).toEqual(onlyPNG);
  expect(await bytes(await exportDownload(page, 'Papillae＋Landmark PNG'))).toEqual(withPNG);
  await page.getByTitle('注釈の表示切り替え', { exact: true }).click();
  const zip = await JSZip.loadAsync(
    await bytes(await exportDownload(page, '完全バックアップ ZIP')),
  );
  expect(await zip.file(`images/${p.images[0].image_id}/sample.png`)!.async('nodebuffer')).toEqual(
    await readFile(sample),
  );
  expect(JSON.parse(await zip.file('project.json')!.async('string')).sessions).toEqual(p.sessions);
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  expect((await project(page)).sessions).toEqual(p.sessions);
  // A separate browser context restores the complete JSON including embedded image.
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('status')).toHaveText('ローカル保存済み');
  await fresh
    .locator('input[type=file]')
    .nth(1)
    .setInputFiles({
      name: 'project.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await expect(fresh.locator('.image-item')).toHaveCount(1);
  await expect(fresh.locator('.busy-overlay')).toHaveCount(0);
  expect((await project(fresh)).sessions).toEqual(p.sessions);
  await context.close();
  await page.getByRole('tab', { name: 'Papillae', exact: true }).click();
  await noticeOff(page);
  await page.screenshot({ path: info.outputPath('workspace.png'), fullPage: true });
  expect(errors).toEqual([]);
});
test('zoom/pan/ROI/display preserve original coordinates; edit, reclassify, undo/redo', async ({
  page,
}) => {
  await load(page);
  await clickOriginal(page, 400, 300);
  let p = await project(page);
  const point = p.sessions[0].points[0];
  expect(Math.abs(point.x_px - 400)).toBeLessThan(2);
  expect(Math.abs(point.y_px - 300)).toBeLessThan(2);
  await noticeOff(page);
  const box = (await page.getByTestId('viewer').boundingBox())!;
  let v = await fitView(page);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.getByRole('button', { name: '拡大', exact: true }).click();
  v = {
    scale: v.scale * 1.2,
    x: center.x - (center.x - v.x) * 1.2,
    y: center.y - (center.y - v.y) * 1.2,
  };
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 140, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  v.x += 80;
  v.y += 40;
  await page.mouse.click(v.x + 700 * v.scale, v.y + 500 * v.scale);
  p = await project(page);
  expect(p.sessions[0].points).toHaveLength(2);
  expect(Math.abs(p.sessions[0].points[1].x_px - 700)).toBeLessThan(2);
  expect(Math.abs(p.sessions[0].points[1].y_px - 500)).toBeLessThan(2);
  const saved = p.sessions[0].points;
  await noticeOff(page);
  await page.getByLabel('明度', { exact: true }).fill('0.3');
  await page.getByLabel('ガンマ', { exact: true }).fill('1.5');
  await page.getByLabel('チャンネル', { exact: true }).selectOption('G');
  expect((await project(page)).sessions[0].points).toEqual(saved);
  await noticeOff(page);
  await page.getByTitle('画像を全体表示', { exact: true }).click();
  await page.getByRole('tab', { name: '編集', exact: true }).click();
  await clickOriginal(page, point.x_px, point.y_px);
  await expect(page.getByLabel('選択点X')).toBeVisible();
  await page.getByLabel('選択点X').fill('430');
  await page.getByLabel('選択点Y').fill('330');
  await page.getByLabel('選択点カテゴリ').selectOption('c5');
  p = await project(page);
  expect(p.sessions[0].points[0]).toMatchObject({ x_px: 430, y_px: 330, category: 'c5' });
  await noticeOff(page);
  await page.getByRole('button', { name: '選択点を削除' }).click();
  await page.keyboard.press('Control+z');
  expect((await project(page)).sessions[0].points).toHaveLength(2);
  await noticeOff(page);
  await page.keyboard.press('Control+y');
  expect((await project(page)).sessions[0].points).toHaveLength(1);
  await noticeOff(page);
  await page.getByRole('tab', { name: 'Papillae', exact: true }).click();
  await page.getByTitle('ドラッグして表示領域を指定', { exact: true }).click();
  v = await fitView(page);
  await page.mouse.move(v.x + 200 * v.scale, v.y + 200 * v.scale);
  await page.mouse.down();
  await page.mouse.move(v.x + 900 * v.scale, v.y + 600 * v.scale, { steps: 8 });
  await page.mouse.up();
  expect((await project(page)).sessions[0].points).toHaveLength(1);
  await expect(page.locator('.image-label')).toContainText('ROI表示中');
});
test('TIFF load, explicit zero/NA, sessions, metadata, duplicate detection and multi-tab guard', async ({
  page,
  context,
}) => {
  await load(page, path.resolve('tests/sample.tif'));
  await page.getByLabel('個体 ID *', { exact: true }).fill('Same-ID');
  await page.getByLabel('計数者', { exact: true }).fill('Alice');
  await page.getByRole('button', { name: '計数完了', exact: true }).click();
  await page.getByTestId('category-b').click();
  await page.getByRole('button', { name: '観察不可', exact: true }).click();
  let p = await project(page);
  expect(p.sessions[0].statuses.a1.observation_status).toBe('complete');
  expect(p.sessions[0].statuses.b.observation_status).toBe('unavailable');
  expect(p.images[0]).toMatchObject({ width: 1200, height: 800 });
  await noticeOff(page);
  await page.getByRole('button', { name: '別セッションを作成' }).click();
  await noticeOff(page);
  await page.getByLabel('計数者', { exact: true }).fill('Bob');
  await clickOriginal(page, 300, 300);
  await page.getByLabel('side', { exact: true }).selectOption('R');
  await page.getByLabel('sex', { exact: true }).selectOption('M');
  p = await project(page);
  expect(p.sessions.map((s) => s.observer)).toEqual(['Alice', 'Bob']);
  expect(p.sessions[0].points).toHaveLength(0);
  expect(p.sessions[1].points).toHaveLength(1);
  expect(p.images[0].metadata.side).toBe('R');
  expect(p.images[0].metadata.sex).toBe('M');
  await noticeOff(page);
  await page.getByLabel('sex', { exact: true }).selectOption('');
  expect((await project(page)).images[0].metadata.sex).toBe('');
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('.locked-banner')).toBeVisible();
  await expect(second.getByRole('button', { name: '画像を追加', exact: true })).toBeDisabled();
  await second.close();
  await noticeOff(page);
  await page.locator('input[type=file]').nth(0).setInputFiles(path.resolve('tests/sample.tif'));
  await expect(page.locator('.image-item')).toHaveCount(2);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await page.getByLabel('個体 ID *', { exact: true }).fill('Same-ID');
  await page.getByLabel('side', { exact: true }).selectOption('R');
  await expect(page.locator('.warning-text')).toContainText('重複');
});
test('all landmark auto advance completes, manual correction stays selected, category visibility at 1366x768', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await load(page);
  for (const button of await page.locator('.category-button').all()) {
    const b = (await button.boundingBox())!;
    expect(b.y + b.height).toBeLessThan(768 - 25);
  }
  await page.getByRole('tab', { name: 'Landmark', exact: true }).click();
  const landmarks = [
    'eye',
    'AN',
    'PN',
    'snout_anterior',
    'upper_lip',
    'snout_posterior',
    'pectoral_upper',
    'pectoral_lower',
    'dorsal_origin',
  ];
  for (let i = 0; i < landmarks.length; i++) {
    await expect(page.getByTestId(`landmark-${landmarks[i]}`)).toHaveClass(/chosen/);
    await clickOriginal(page, 250 + i * 55, 300);
  }
  await expect(page.locator('.completion')).toContainText('全ランドマークの記録完了');
  let p = await project(page);
  expect(
    Object.values(p.sessions[0].landmarks).filter((l) => l.observation_status === 'recorded'),
  ).toHaveLength(9);
  await noticeOff(page);
  await page.getByTestId('landmark-eye').click();
  await clickOriginal(page, 300, 350);
  await expect(page.getByRole('alert')).toContainText('記録済み');
  await page.getByLabel('選択点X').fill('260');
  p = await project(page);
  expect(p.sessions[0].landmarks.eye.x_px).toBe(260);
  expect(
    Object.values(p.sessions[0].landmarks).filter((l) => l.observation_status === 'recorded'),
  ).toHaveLength(9);
});
test('JSON conflicts merge safely; CSV reload adds new sessions; invalid JSON is atomic', async ({
  page,
}) => {
  await load(page);
  await page.getByLabel('個体 ID *', { exact: true }).fill('QA');
  await page.getByLabel('計数者', { exact: true }).fill('A');
  await clickOriginal(page, 300, 300);
  const p = await project(page);
  const conflict = structuredClone(p);
  conflict.sessions[0].observer = 'B';
  await noticeOff(page);
  await page
    .locator('input[type=file]')
    .nth(1)
    .setInputFiles({
      name: 'project.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(conflict)),
    });
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('競合');
  expect((await project(page)).sessions).toHaveLength(2);
  const z = await JSZip.loadAsync(await bytes(await exportDownload(page, 'CSV 5種 ZIP')));
  const files = [];
  for (const name of ['papillae_status.csv', 'papillae_coordinates.csv', 'landmarks.csv'])
    files.push({ name, mimeType: 'text/csv', buffer: await z.file(name)!.async('nodebuffer') });
  await noticeOff(page);
  await page.locator('input[type=file]').nth(1).setInputFiles(files);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  expect((await project(page)).sessions).toHaveLength(4);
  await noticeOff(page);
  await page
    .locator('input[type=file]')
    .nth(1)
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  expect((await project(page)).sessions).toHaveLength(4);
});
test('cold browser restart restores IndexedDB and original image bytes', async ({}, info) => {
  const profile = info.outputPath('browser-profile');
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      headless: true,
      baseURL: 'http://127.0.0.1:4173',
      viewport: { width: 1440, height: 1000 },
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : { channel: 'msedge' }),
    });
  let context = await launch();
  let page = await context.newPage();
  let before: Project;
  try {
    await load(page);
    await page.getByLabel('個体 ID *', { exact: true }).fill('COLD-01');
    await page.getByLabel('計数者', { exact: true }).fill('Cold Observer');
    await clickOriginal(page, 555, 444);
    await page.getByRole('tab', { name: 'Landmark', exact: true }).click();
    await clickOriginal(page, 390, 325);
    before = await project(page);
    await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  } finally {
    await context.close();
  }
  context = await launch();
  page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4173');
    await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
    const restored = await project(page);
    expect(restored).toEqual(before!);
    await page.screenshot({ path: info.outputPath('cold-restored.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
test('dragging points, ROI clicks, visibility, keyboard shortcuts and display reset', async ({
  page,
}) => {
  await load(page);
  const viewer = page.getByTestId('viewer');
  const largerView = (await viewer.boundingBox())!;
  expect(largerView.width).toBeGreaterThan(900);
  expect(largerView.height).toBeGreaterThan(780);
  await expect(viewer).toHaveCSS('cursor', /url\(.+\) 7 7, crosshair/);
  const initialView = await fitView(page);
  await page.mouse.move(
    initialView.x + 400 * initialView.scale,
    initialView.y + 300 * initialView.scale,
  );
  await expect(page.getByTestId('cursor-position')).toHaveText(/X [\d.]+\s+\/\s+Y [\d.]+ px/);
  const coords = (await page.getByTestId('cursor-position').innerText())
    .match(/[\d.]+/g)!
    .map(Number);
  expect(Math.abs(coords[0] - 400)).toBeLessThan(2);
  expect(Math.abs(coords[1] - 300)).toBeLessThan(2);
  await page.mouse.move(largerView.x - 10, largerView.y + 100);
  await expect(page.getByTestId('cursor-position')).toHaveText('原点：画像左上 · 単位：px');
  await page.keyboard.press('2');
  await clickOriginal(page, 400, 300);
  let p = await project(page);
  expect(p.sessions[0].points[0].category).toBe('a2');
  const v = await fitView(page);
  await noticeOff(page);
  await page.getByRole('tab', { name: '編集', exact: true }).click();
  await page.mouse.move(v.x + 400 * v.scale, v.y + 300 * v.scale);
  await page.mouse.down();
  await page.mouse.move(v.x + 500 * v.scale, v.y + 400 * v.scale, { steps: 10 });
  await page.mouse.up();
  p = await project(page);
  expect(Math.abs(p.sessions[0].points[0].x_px - 500)).toBeLessThan(2);
  expect(Math.abs(p.sessions[0].points[0].y_px - 400)).toBeLessThan(2);
  await noticeOff(page);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('選択点X')).toHaveCount(0);
  await page.getByRole('button', { name: 'カテゴリ表示切替' }).click();
  expect((await project(page)).sessions[0].points).toHaveLength(1);
  await noticeOff(page);
  await page.getByRole('button', { name: 'カテゴリ表示切替' }).click();
  await page.getByRole('tab', { name: 'Papillae', exact: true }).click();
  await page.getByTitle('ドラッグして表示領域を指定', { exact: true }).click();
  await page.mouse.move(v.x + 200 * v.scale, v.y + 150 * v.scale);
  await page.mouse.down();
  await page.mouse.move(v.x + 1000 * v.scale, v.y + 650 * v.scale, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.image-label')).toContainText('ROI表示中');
  // ROI fit uses the same original-image coordinate system.
  const box = (await page.getByTestId('viewer').boundingBox())!;
  const original = { x: 600, y: 400 };
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  p = await project(page);
  expect(p.sessions[0].points).toHaveLength(2);
  expect(Math.abs(p.sessions[0].points[1].x_px - original.x)).toBeLessThan(3);
  expect(Math.abs(p.sessions[0].points[1].y_px - original.y)).toBeLessThan(3);
  await noticeOff(page);
  await page.getByLabel('明度', { exact: true }).fill('0.5');
  await page.getByLabel('コントラスト', { exact: true }).fill('2');
  await page.getByRole('button', { name: '表示調整をリセット', exact: true }).click();
  await expect(page.getByLabel('明度', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('コントラスト', { exact: true })).toHaveValue('1');
  expect((await project(page)).sessions[0].points).toEqual(p.sessions[0].points);
});
test('shared category settings can replace initial IDs before recording', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await page.getByRole('button', { name: '設定保存', exact: true }).click();
  const { DEFAULT_CATEGORIES, DEFAULT_LANDMARKS } = await import('../../src/config');
  const config = {
    categories: DEFAULT_CATEGORIES.map((c, i) => (i === 0 ? { ...c, id: 'custom_a' } : c)),
    landmark_definitions: DEFAULT_LANDMARKS,
  };
  await page
    .locator('input[type=file]')
    .nth(2)
    .setInputFiles({
      name: 'categories.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(config)),
    });
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await expect(page.getByTestId('category-custom_a')).toHaveClass(/chosen/);
  await page.locator('input[type=file]').nth(0).setInputFiles(sample);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await noticeOff(page);
  await clickOriginal(page, 300, 300);
  const p = await project(page);
  expect(p.sessions[0].points[0].category).toBe('custom_a');
  await noticeOff(page);
  await page
    .locator('input[type=file]')
    .nth(2)
    .setInputFiles({
      name: 'categories.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(config)),
    });
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('記録開始後');
  expect((await project(page)).sessions[0].points).toEqual(p.sessions[0].points);
});
test('JSON rejects wrong original dimensions or hash without changing existing annotations', async ({
  page,
}) => {
  await load(page);
  await clickOriginal(page, 300, 300);
  const p = await project(page);
  for (const field of ['width', 'sha256'] as const) {
    const bad = structuredClone(p);
    if (field === 'width') bad.images[0].width = 1201;
    else bad.images[0].sha256 = 'a'.repeat(64);
    await noticeOff(page);
    await page
      .locator('input[type=file]')
      .nth(1)
      .setInputFiles({
        name: 'bad.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(bad)),
      });
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText(field === 'width' ? '寸法' : 'SHA-256');
    expect((await project(page)).sessions).toEqual(p.sessions);
  }
});
test('switching from ROI to a different-sized JPG preserves separate image/side/session coordinates', async ({
  page,
}) => {
  await load(page);
  await page.getByLabel('個体 ID *', { exact: true }).fill('PAIR-01');
  await page.getByLabel('計数者', { exact: true }).fill('A');
  await clickOriginal(page, 350, 300);
  const v = await fitView(page);
  await page.getByTitle('ドラッグして表示領域を指定', { exact: true }).click();
  await page.mouse.move(v.x + 200 * v.scale, v.y + 200 * v.scale);
  await page.mouse.down();
  await page.mouse.move(v.x + 900 * v.scale, v.y + 600 * v.scale, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.image-label')).toContainText('ROI表示中');
  await page
    .locator('input[type=file]')
    .nth(0)
    .setInputFiles(path.resolve('tests/sample-small.jpg'));
  await expect(page.locator('.image-item')).toHaveCount(2);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await expect(page.locator('.image-label')).toContainText('600 × 400');
  await expect(page.locator('.image-label')).not.toContainText('ROI表示中');
  await noticeOff(page);
  await page.getByLabel('個体 ID *', { exact: true }).fill('PAIR-01');
  await page.getByLabel('side', { exact: true }).selectOption('R');
  await page.getByLabel('計数者', { exact: true }).fill('B');
  const box = (await page.getByTestId('viewer').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const p = await project(page);
  expect(p.images.map((i) => i.metadata.side)).toEqual(['L', 'R']);
  expect(p.sessions.map((s) => s.observer)).toEqual(['A', 'B']);
  expect(p.sessions[0].points).toHaveLength(1);
  expect(p.sessions[1].points).toHaveLength(1);
  expect(Math.abs(p.sessions[1].points[0].x_px - 300)).toBeLessThan(2);
  expect(Math.abs(p.sessions[1].points[0].y_px - 200)).toBeLessThan(2);
  await noticeOff(page);
  await page.locator('.image-item').first().click();
  await expect(page.locator('.image-label')).toContainText('1,200 × 800');
  expect((await project(page)).sessions).toEqual(p.sessions);
});
test('every click counts even beside an existing mark; dense annotations stay editable', async ({
  page,
}) => {
  await load(page);
  await clickOriginal(page, 400, 300);
  await clickOriginal(page, 402, 301);
  await clickOriginal(page, 400, 300);
  let p = await project(page);
  expect(p.sessions[0].points).toHaveLength(3);
  // Restore a dense synthetic session, then add and edit through the actual canvas.
  const large = structuredClone(p);
  for (let i = 0; i < 2000; i++)
    large.sessions[0].points.push({
      point_id: crypto.randomUUID(),
      category: 'a1',
      x_px: 100 + (i % 80) * 12,
      y_px: 100 + Math.floor(i / 80) * 20,
    });
  await noticeOff(page);
  await page
    .locator('input[type=file]')
    .nth(1)
    .setInputFiles({
      name: 'dense.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(large)),
    });
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await page.getByLabel('セッション', { exact: true }).selectOption({ index: 1 });
  await noticeOff(page);
  await clickOriginal(page, 1120, 730);
  p = await project(page);
  expect(p.sessions[1].points).toHaveLength(2004);
  await noticeOff(page);
  await page.getByRole('tab', { name: '編集', exact: true }).click();
  await clickOriginal(page, 1120, 730);
  await expect(page.getByLabel('選択点X')).toBeVisible();
  await page.getByRole('button', { name: '選択点を削除', exact: true }).click();
  expect((await project(page)).sessions[1].points).toHaveLength(2003);
});
