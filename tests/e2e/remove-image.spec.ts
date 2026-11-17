import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { exportedFile } from './downloads';
import type { Project } from '../../src/domain';

for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile image removal' : 'desktop image removal', () => {
    test.use({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    test('cancels safely, removes only selected image sessions, restores all data with one undo, and handles the last image', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const press = async (l: ReturnType<Page['locator']>) => (mobile ? l.tap() : l.click());
      const dismiss = async () => {
        const b = page.getByRole('button', { name: '通知を閉じる' });
        if (await b.count()) await press(b);
      };
      const images = async () => {
        if (mobile)
          await press(
            page
              .locator('.mobile-dock')
              .getByRole('button', { name: '画像・個体情報を開く', exact: true }),
          );
      };
      const close = async () => {
        if (mobile) await press(page.getByRole('button', { name: 'パネルを閉じる', exact: true }));
      };
      const output = async (name = 'プロジェクト JSON') => {
        await dismiss();
        await press(page.getByRole('button', { name: '書き出す', exact: true }));
        return (await exportedFile(page, () => press(page.getByRole('button', { name })))).buffer;
      };
      const saved = async (): Promise<Project> => JSON.parse((await output()).toString());
      const add = async () => {
        if (mobile) await press(page.getByRole('button', { name: '十字位置に追加', exact: true }));
        else {
          const b = (await page.getByTestId('viewer').boundingBox())!;
          await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
        }
      };
      const mode = async (name: string) =>
        press(
          page
            .locator(mobile ? '.mobile-dock' : '.right-panel')
            .getByRole('tab', { name, exact: true }),
        );
      const history = async (redo = false) => {
        await dismiss();
        if (mobile)
          await press(
            page
              .locator('.mobile-dock')
              .getByRole('button', { name: redo ? 'やり直す' : '元に戻す', exact: true }),
          );
        else await page.keyboard.press(redo ? 'Control+y' : 'Control+z');
      };
      const remove = async (accept: boolean) => {
        let message = '';
        page.once('dialog', async (dialog) => {
          message = dialog.message();
          expect(dialog.type()).toBe('confirm');
          if (accept) await dialog.accept();
          else await dialog.dismiss();
        });
        await press(page.getByRole('button', { name: '選択中の画像を削除', exact: true }));
        return message;
      };
      await page.goto('/');
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      await page
        .locator('input[type=file]')
        .nth(0)
        .setInputFiles([path.resolve('public/sample.png'), path.resolve('tests/sample-small.jpg')]);
      await expect(page.locator('.busy-overlay')).toHaveCount(0);
      await expect(page.locator('.image-item')).toHaveCount(2);
      await dismiss();
      await page.getByLabel('個体 ID *', { exact: true }).fill('REMOVE-01');
      await page.getByLabel('計数者', { exact: true }).fill('First observer');
      await close();
      await add();
      await mode('Landmark');
      await add();
      await mode('Papillae');
      await images();
      await press(page.getByRole('button', { name: '別セッションを作成', exact: true }));
      await dismiss();
      await page.getByLabel('計数者', { exact: true }).fill('Second observer');
      await close();
      await add();
      await add();
      await images();
      await press(page.locator('.image-item').nth(1));
      await page.getByLabel('個体 ID *', { exact: true }).fill('KEEP-01');
      await page.getByLabel('計数者', { exact: true }).fill('Keep observer');
      await close();
      await add();
      await images();
      await press(page.locator('.image-item').nth(0));
      await close();
      const before = await saved(),
        targetId = before.images[0].image_id;
      await images();
      const message = await remove(false);
      expect(message).toContain('sample.png');
      expect(message).toContain('REMOVE-01');
      expect(message).toContain('2セッション');
      expect(message).toContain('孔器3点');
      expect(message).toContain('Landmark1点');
      await expect(page.locator('.image-item')).toHaveCount(2);
      await close();
      expect(await saved()).toEqual(before);
      await images();
      await remove(true);
      await expect(page.locator('.image-item')).toHaveCount(1);
      await close();
      const after = await saved();
      expect(after.images).toEqual(before.images.filter((i) => i.image_id !== targetId));
      expect(after.sessions).toEqual(before.sessions.filter((s) => s.image_id !== targetId));
      const csv = await JSZip.loadAsync(await output('CSV 5種 ZIP'));
      for (const filename of [
        'specimens.csv',
        'papillae_counts.csv',
        'papillae_coordinates.csv',
        'landmarks.csv',
      ]) {
        const rows = Papa.parse<Record<string, string>>(await csv.file(filename)!.async('string'), {
          header: true,
          skipEmptyLines: true,
        }).data;
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.image_id === after.images[0].image_id)).toBe(true);
      }
      await history();
      expect(await saved()).toEqual(before);
      await history(true);
      expect(await saved()).toEqual(after);
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      await page.reload();
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      expect(await saved()).toEqual(after);
      await images();
      await remove(true);
      await close();
      const empty = await saved();
      expect(empty.images).toEqual([]);
      expect(empty.sessions).toEqual([]);
      await expect(page.getByRole('button', { name: '画像を読み込む', exact: true })).toBeVisible();
      await history();
      expect(await saved()).toEqual(after);
      await history(true);
      expect(await saved()).toEqual(empty);
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      await page.reload();
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      expect(await saved()).toEqual(empty);
      await page
        .locator('input[type=file]')
        .nth(0)
        .setInputFiles(path.resolve('public/sample.png'));
      await expect(page.locator('.busy-overlay')).toHaveCount(0);
      await expect(page.locator('.image-item')).toHaveCount(1);
      await close();
      await expect(page.locator('.canvas-host canvas')).toHaveCount(2);
      expect(errors).toEqual([]);
    });
  });
}
