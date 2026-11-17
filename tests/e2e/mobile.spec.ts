import { test, expect, type Page, type CDPSession } from '@playwright/test';
import path from 'node:path';
import { exportedFile } from './downloads';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { DEFAULT_CATEGORIES } from '../../src/config';
import type { Project } from '../../src/domain';
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function dismiss(page: Page) {
  const b = page.getByRole('button', { name: '通知を閉じる' });
  if (await b.count()) await b.tap();
}
async function closeSheet(page: Page) {
  await page.getByRole('button', { name: 'パネルを閉じる', exact: true }).tap();
  await expect(page.locator('.mobile-sheet-backdrop')).toHaveCount(0);
}
async function prepare(page: Page) {
  await page.goto('/');
  await expect(page.locator('.mobile-app')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await page.locator('input[type=file]').nth(0).setInputFiles(path.resolve('public/sample.png'));
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '画像・個体情報', exact: true })).toBeVisible();
  await dismiss(page);
  await page.getByLabel('個体 ID *', { exact: true }).fill('MOBILE-01');
  await page.getByLabel('計数者', { exact: true }).fill('Mobile observer');
  await page.getByLabel('sex', { exact: true }).selectOption('F');
  await closeSheet(page);
  await expect(page.locator('.canvas-host canvas')).toHaveCount(2);
}
async function output(page: Page, label = 'プロジェクト JSON') {
  await dismiss(page);
  await page.getByRole('button', { name: '書き出す', exact: true }).tap();
  await expect(page.getByRole('button', { name: '書き出す', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  return (await exportedFile(page, () => page.getByRole('button', { name: label }).tap())).buffer;
}
async function saved(page: Page): Promise<Project> {
  return JSON.parse((await output(page)).toString());
}
async function view(page: Page) {
  const b = (await page.getByTestId('viewer').boundingBox())!;
  const scale = Math.min((b.width - 32) / 1200, (b.height - 32) / 800);
  return {
    box: b,
    scale,
    x: b.x + (b.width - 1200 * scale) / 2,
    y: b.y + (b.height - 800 * scale) / 2,
  };
}
async function drag(
  cdp: CDPSession,
  a: { x: number; y: number },
  b: { x: number; y: number },
  cancel = false,
) {
  const point = (x: number, y: number) => ({ id: 1, x, y, radiusX: 3, radiusY: 3, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(a.x, a.y)],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8)],
    });
    // Space samples over time like a physical gesture; zero-time CDP flings suppress the next native click.
    await cdp.send('Runtime.evaluate', {
      expression: 'new Promise(r=>setTimeout(r,20))',
      awaitPromise: true,
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  });
  await cdp.send('Runtime.evaluate', {
    expression: 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    awaitPromise: true,
  });
}
async function pinch(cdp: CDPSession, center: { x: number; y: number }) {
  const points = (r: number) => [
    { id: 1, x: center.x - r, y: center.y, radiusX: 3, radiusY: 3, force: 1 },
    { id: 2, x: center.x + r, y: center.y, radiusX: 3, radiusY: 3, force: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(40) });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(40 + i * 5),
    });
    // Space samples over time like a physical gesture; zero-time CDP flings suppress the next native click.
    await cdp.send('Runtime.evaluate', {
      expression: 'new Promise(r=>setTimeout(r,20))',
      awaitPromise: true,
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Runtime.evaluate', {
    expression: 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    awaitPromise: true,
  });
}
test('portrait aim entry, metadata, autosave, CSV/PNG/JSON and desktop data exchange', async ({
  page,
  browser,
}, info) => {
  await prepare(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const v = await view(page);
  expect(v.box.height).toBeGreaterThan(350);
  await expect(page.getByRole('button', { name: '十字で記録', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.touchscreen.tap(v.box.x + v.box.width / 2, v.box.y + v.box.height / 2);
  expect((await saved(page)).sessions[0].points).toHaveLength(0);
  await dismiss(page);
  await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
  let p = await saved(page);
  expect(p.images[0].metadata).toMatchObject({ ID: 'MOBILE-01', sex: 'F' });
  expect(p.sessions[0].observer).toBe('Mobile observer');
  expect(p.sessions[0].points).toHaveLength(1);
  expect(p.sessions[0].points[0]).toMatchObject({ category: 'a1', x_px: 600, y_px: 400 });
  await dismiss(page);
  await page.locator('.mobile-dock').getByRole('button', { name: '計数完了', exact: true }).tap();
  p = await saved(page);
  expect(p.sessions[0].statuses.a1.observation_status).toBe('complete');
  const csv = await JSZip.loadAsync(await output(page, 'CSV 5種 ZIP'));
  const count = Papa.parse<Record<string, string>>(
    await csv.file('papillae_counts.csv')!.async('string'),
    { header: true, skipEmptyLines: true },
  ).data[0];
  expect(count).toMatchObject({ a1: '1', a_total: 'NA', papillae_total: 'NA' });
  const png = await JSZip.loadAsync(await output(page, '注釈つき PNG 2種 ZIP'));
  expect(Object.keys(png.files)).toHaveLength(2);
  for (const entry of Object.values(png.files)) {
    const b = await entry.async('nodebuffer');
    expect(b.readUInt32BE(16)).toBe(1200);
    expect(b.readUInt32BE(20)).toBe(800);
  }
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  expect(await saved(page)).toEqual(p);
  await dismiss(page);
  await page.screenshot({ path: info.outputPath('mobile-portrait.png'), fullPage: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    isMobile: false,
    hasTouch: false,
  });
  try {
    const desktop = await context.newPage();
    await desktop.goto('http://127.0.0.1:4173');
    await expect(desktop.getByRole('status')).toHaveText('ローカル保存済み');
    await desktop
      .locator('input[type=file]')
      .nth(1)
      .setInputFiles({
        name: 'mobile.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(p)),
      });
    await expect(desktop.locator('.busy-overlay')).toHaveCount(0);
    await desktop.getByRole('button', { name: '通知を閉じる' }).click();
    await desktop.getByRole('button', { name: '書き出す', exact: true }).click();
    const downloaded = await exportedFile(desktop, () =>
      desktop.getByRole('button', { name: 'プロジェクト JSON' }).click(),
    );
    expect(JSON.parse(downloaded.buffer.toString())).toEqual(p);
  } finally {
    await context.close();
  }
});
test('direct tap saves original pixels, pans/pinches/cancel never count, and the next tap counts once', async ({
  page,
  context,
}) => {
  await prepare(page);
  await page.getByRole('button', { name: '直接タップ', exact: true }).tap();
  const v = await view(page);
  await page.touchscreen.tap(v.x + 400 * v.scale, v.y + 300 * v.scale);
  let p = await saved(page);
  expect(p.sessions[0].points).toHaveLength(1);
  expect(Math.abs(p.sessions[0].points[0].x_px - 400)).toBeLessThan(3);
  expect(Math.abs(p.sessions[0].points[0].y_px - 300)).toBeLessThan(3);
  await dismiss(page);
  const cdp = await context.newCDPSession(page),
    center = { x: v.box.x + v.box.width / 2, y: v.box.y + v.box.height / 2 };
  const oldZoom = parseInt(await page.getByTestId('zoom').innerText());
  await pinch(cdp, center);
  expect(parseInt(await page.getByTestId('zoom').innerText())).toBeGreaterThan(oldZoom * 1.8);
  expect((await saved(page)).sessions[0].points).toHaveLength(1);
  await dismiss(page);
  await page.touchscreen.tap(center.x, center.y);
  p = await saved(page);
  expect(p.sessions[0].points).toHaveLength(2);
  expect(p.sessions[0].points[1].x_px).toBeCloseTo(600, 0);
  expect(p.sessions[0].points[1].y_px).toBeCloseTo(400, 0);
  await dismiss(page);
  await drag(cdp, center, { x: center.x + 50, y: center.y + 30 });
  expect((await saved(page)).sessions[0].points).toHaveLength(2);
  await dismiss(page);
  await page.touchscreen.tap(center.x, center.y);
  p = await saved(page);
  expect(p.sessions[0].points).toHaveLength(3);
  expect(Math.abs(p.sessions[0].points[2].x_px - (600 - 50 / (v.scale * 2)))).toBeLessThan(3);
  expect(Math.abs(p.sessions[0].points[2].y_px - (400 - 30 / (v.scale * 2)))).toBeLessThan(3);
  await dismiss(page);
  await drag(cdp, center, { x: center.x + 20, y: center.y + 10 }, true);
  expect((await saved(page)).sessions[0].points).toHaveLength(3);
});
test('all 32 categories remain selectable through touch sheets and counts agree', async ({
  page,
}, info) => {
  await prepare(page);
  for (const c of DEFAULT_CATEGORIES) {
    await page
      .locator('.mobile-dock')
      .getByRole('button', { name: 'カテゴリ一覧を開く', exact: true })
      .tap();
    await page.getByTestId(`category-${c.id}`).tap();
    await expect(page.locator('.mobile-sheet-backdrop')).toHaveCount(0);
    await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
    await page.locator('.mobile-dock').getByRole('button', { name: '計数完了', exact: true }).tap();
  }
  const p = await saved(page);
  expect(p.sessions[0].points).toHaveLength(32);
  expect(p.sessions[0].points.map((pt) => pt.category)).toEqual(
    DEFAULT_CATEGORIES.map((c) => c.id),
  );
  expect(
    Object.values(p.sessions[0].statuses).every((s) => s.observation_status === 'complete'),
  ).toBe(true);
  const csv = await JSZip.loadAsync(await output(page, 'CSV 5種 ZIP'));
  const row = Papa.parse<Record<string, string>>(
    await csv.file('papillae_counts.csv')!.async('string'),
    { header: true, skipEmptyLines: true },
  ).data[0];
  expect(row).toMatchObject({ a_total: '6', c_total: '10', papillae_total: '32' });
  await dismiss(page);
  await page
    .locator('.mobile-dock')
    .getByRole('button', { name: 'カテゴリ一覧を開く', exact: true })
    .tap();
  await page.screenshot({ path: info.outputPath('mobile-category-sheet.png'), fullPage: true });
});
test('landmark auto advance, unavailable, skip and auto-off work in mobile controls', async ({
  page,
}) => {
  await prepare(page);
  await page.locator('.mobile-dock').getByRole('tab', { name: 'Landmark', exact: true }).tap();
  await expect(page.locator('.mobile-category-select')).toContainText('眼後端');
  await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
  await expect(page.locator('.mobile-category-select')).toContainText('眼中心');
  await page.locator('.mobile-dock').getByRole('button', { name: '観察不可', exact: true }).tap();
  await expect(page.locator('.mobile-category-select')).toContainText('眼前端');
  await page.locator('.mobile-dock').getByRole('button', { name: 'スキップ', exact: true }).tap();
  await expect(page.locator('.mobile-category-select')).toContainText('AN');
  await page
    .locator('.mobile-dock')
    .getByRole('button', { name: 'カテゴリ一覧を開く', exact: true })
    .tap();
  await page.getByLabel('自動で次へ').uncheck();
  await closeSheet(page);
  await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
  await expect(page.locator('.mobile-category-select')).toContainText('AN');
  let p = await saved(page);
  expect(p.sessions[0].landmarks.eye_posterior.observation_status).toBe('recorded');
  expect(p.sessions[0].landmarks.eye.observation_status).toBe('unavailable');
  expect(p.sessions[0].landmarks.eye_anterior.observation_status).toBe('unrecorded');
  expect(p.sessions[0].landmarks.AN.observation_status).toBe('recorded');
  await dismiss(page);
  await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
  await expect(page.getByRole('alert')).toContainText('記録済みです');
  p = await saved(page);
  expect(
    Object.values(p.sessions[0].landmarks).filter((l) => l.observation_status === 'recorded'),
  ).toHaveLength(2);
  await dismiss(page);
  await page.locator('.mobile-dock').getByRole('tab', { name: 'Landmark', exact: true }).tap();
  await page
    .locator('.mobile-dock')
    .getByRole('button', { name: 'カテゴリ一覧を開く', exact: true })
    .tap();
  await page.getByTestId('landmark-dorsal_origin').tap();
  await expect(page.locator('.mobile-category-select')).toContainText('第一背鰭前端');
  await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
  p = await saved(page);
  expect(p.sessions[0].landmarks.dorsal_origin).toMatchObject({
    observation_status: 'recorded',
    x_px: 600,
    y_px: 400,
  });
});
test('touch selection, center move, one-pixel nudge, deletion and undo/redo preserve data', async ({
  page,
  context,
}) => {
  await prepare(page);
  await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
  await page.locator('.mobile-dock').getByRole('tab', { name: '編集', exact: true }).tap();
  const v = await view(page),
    center = { x: v.box.x + v.box.width / 2, y: v.box.y + v.box.height / 2 };
  await page.touchscreen.tap(center.x, center.y);
  await expect(page.getByRole('button', { name: '十字へ移動', exact: true })).toBeEnabled();
  const cdp = await context.newCDPSession(page);
  await drag(cdp, center, { x: center.x + 40, y: center.y + 20 });
  await page.getByRole('button', { name: '十字へ移動', exact: true }).tap();
  let p = await saved(page);
  expect(Math.abs(p.sessions[0].points[0].x_px - (600 - 40 / v.scale))).toBeLessThan(3);
  await dismiss(page);
  await page
    .locator('.mobile-dock')
    .getByRole('button', { name: '点の編集パネルを開く', exact: true })
    .tap();
  const before = p.sessions[0].points[0].x_px;
  await page.getByRole('button', { name: '右へ1px', exact: true }).tap();
  await expect(page.getByLabel('選択点X', { exact: true })).toHaveValue(String(before + 1));
  await page.getByRole('button', { name: '選択点を削除', exact: true }).tap();
  await closeSheet(page);
  expect((await saved(page)).sessions[0].points).toHaveLength(0);
  await dismiss(page);
  await page.locator('.mobile-dock').getByRole('button', { name: '元に戻す', exact: true }).tap();
  p = await saved(page);
  expect(p.sessions[0].points[0].x_px).toBeCloseTo(before + 1, 6);
  await dismiss(page);
  await page.locator('.mobile-dock').getByRole('button', { name: 'やり直す', exact: true }).tap();
  expect((await saved(page)).sessions[0].points).toHaveLength(0);
});
test('landscape and a small portrait layout remain usable without losing coordinates', async ({
  page,
}, info) => {
  await prepare(page);
  await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
  const original = (await saved(page)).sessions;
  await dismiss(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.mobile-app')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = (await page.getByTestId('viewer').boundingBox())!;
  expect(box.height).toBeGreaterThan(150);
  expect(box.width).toBeGreaterThan(500);
  await expect(page.getByRole('button', { name: '十字位置に追加', exact: true })).toBeInViewport();
  expect((await saved(page)).sessions).toEqual(original);
  await dismiss(page);
  await page.screenshot({ path: info.outputPath('mobile-landscape.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: '十字位置に追加', exact: true })).toBeInViewport();
  expect((await saved(page)).sessions).toEqual(original);
  await dismiss(page);
  await page.screenshot({ path: info.outputPath('mobile-small.png'), fullPage: true });
});
test('backgrounding immediately flushes the latest point even while debounce timers are paused', async ({
  page,
}) => {
  await prepare(page);
  await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.mobile-add')!.click();
    window.dispatchEvent(new Event('pagehide'));
  });
  const persisted = await page.evaluate(
    async () =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('papillae-annotator-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('projects').objectStore('projects').get('current');
          read.onsuccess = () => {
            resolve(read.result.project);
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
  );
  expect((persisted as Project).sessions[0].points).toHaveLength(1);
  await page.clock.resume();
});
