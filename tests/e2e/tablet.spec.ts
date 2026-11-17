import { test, expect } from '@playwright/test';
import path from 'node:path';
import { exportedFile } from './downloads';
import type { Project } from '../../src/domain';

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 1024, height: 1366 },
]) {
  test.describe(`touch tablet ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    test('records with touch controls in both orientations, keeps original coordinates, and exports JSON', async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const dismiss = async () => {
        const b = page.getByRole('button', { name: '通知を閉じる' });
        if (await b.count()) await b.tap();
      };
      const saved = async (): Promise<Project> => {
        await dismiss();
        await page.getByRole('button', { name: '書き出す', exact: true }).tap();
        return JSON.parse(
          (
            await exportedFile(page, () =>
              page.getByRole('button', { name: 'プロジェクト JSON' }).tap(),
            )
          ).buffer.toString(),
        );
      };
      await page.goto('/');
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await expect(page.locator('.mobile-app')).toBeVisible();
      await page
        .locator('input[type=file]')
        .nth(0)
        .setInputFiles(path.resolve('public/sample.png'));
      await expect(page.locator('.busy-overlay')).toHaveCount(0);
      await page.getByLabel('個体 ID *', { exact: true }).fill('TABLET-01');
      await page.getByLabel('計数者', { exact: true }).fill('Tablet observer');
      await page.getByRole('button', { name: 'パネルを閉じる', exact: true }).tap();
      await dismiss();
      await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
      const zoom = parseInt(await page.getByTestId('zoom').innerText());
      await page.getByRole('button', { name: '拡大', exact: true }).tap();
      expect(parseInt(await page.getByTestId('zoom').innerText())).toBeGreaterThan(zoom);
      await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
      await page.locator('.mobile-dock').getByRole('tab', { name: 'Landmark', exact: true }).tap();
      await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
      const before = await saved();
      expect(before.sessions[0].points).toHaveLength(2);
      for (const point of before.sessions[0].points)
        expect(point).toMatchObject({
          category: 'a1',
          x_px: expect.closeTo(600, 6),
          y_px: expect.closeTo(400, 6),
        });
      expect(before.sessions[0].landmarks.eye_posterior).toMatchObject({
        observation_status: 'recorded',
        x_px: expect.closeTo(600, 6),
        y_px: expect.closeTo(400, 6),
      });
      await dismiss();
      await page.screenshot({ path: info.outputPath('tablet-portrait.png'), fullPage: true });
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await expect(page.locator('.mobile-app')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(
        page.getByRole('button', { name: '十字位置に追加', exact: true }),
      ).toBeInViewport();
      const box = (await page.getByTestId('viewer').boundingBox())!;
      expect(box.width).toBeGreaterThan(700);
      expect(box.height).toBeGreaterThan(400);
      expect((await saved()).sessions).toEqual(before.sessions);
      await dismiss();
      await page
        .locator('.mobile-dock')
        .getByRole('button', { name: 'カテゴリ一覧を開く', exact: true })
        .tap();
      await expect(page.locator('.landmark-button')).toHaveCount(13);
      await page.getByTestId('landmark-dorsal_origin').tap();
      await expect(page.locator('.mobile-category-select')).toContainText('第一背鰭前端');
      await page.getByRole('button', { name: '十字位置に追加', exact: true }).tap();
      const after = await saved();
      expect(after.sessions[0].landmarks.dorsal_origin).toMatchObject({
        observation_status: 'recorded',
        x_px: expect.closeTo(600, 6),
        y_px: expect.closeTo(400, 6),
      });
      expect(after.sessions[0].points).toEqual(before.sessions[0].points);
      await dismiss();
      await page.screenshot({ path: info.outputPath('tablet-landscape.png'), fullPage: true });
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      await page.reload();
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      expect(await saved()).toEqual(after);
      expect(errors).toEqual([]);
    });
  });
}
