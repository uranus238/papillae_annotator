import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { exportedFile } from './downloads';
import type { Project } from '../../src/domain';

for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile bulk completion' : 'desktop bulk completion', () => {
    test.use({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    test('selects across groups, retains NA, exports zeros, and undoes/redoes the whole operation once', async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const press = async (locator: ReturnType<Page['locator']>) =>
        mobile ? locator.tap() : locator.click();
      const dismiss = async () => {
        const close = page.getByRole('button', { name: '通知を閉じる' });
        if (await close.count()) await press(close);
      };
      const closeSheet = async () => {
        if (mobile) await press(page.getByRole('button', { name: 'パネルを閉じる', exact: true }));
      };
      const openSheet = async () => {
        if (mobile)
          await press(
            page
              .locator('.mobile-dock')
              .getByRole('button', { name: 'カテゴリ一覧を開く', exact: true }),
          );
      };
      const output = async (name = 'プロジェクト JSON') => {
        await dismiss();
        await press(page.getByRole('button', { name: '書き出す', exact: true }));
        return (await exportedFile(page, () => press(page.getByRole('button', { name })))).buffer;
      };
      const saved = async (): Promise<Project> => JSON.parse((await output()).toString());
      await page.goto('/');
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      await page
        .locator('input[type=file]')
        .nth(0)
        .setInputFiles(path.resolve('public/sample.png'));
      await expect(page.locator('.busy-overlay')).toHaveCount(0);
      await dismiss();
      await page.getByLabel('個体 ID *', { exact: true }).fill('BULK-01');
      await page.getByLabel('計数者', { exact: true }).fill('Bulk observer');
      await closeSheet();
      if (mobile) await press(page.getByRole('button', { name: '十字位置に追加', exact: true }));
      else {
        const b = (await page.getByTestId('viewer').boundingBox())!;
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      }
      await openSheet();
      await press(page.getByTestId('category-b'));
      await press(
        page
          .locator(mobile ? '.mobile-dock' : '.category-state')
          .getByRole('button', { name: '観察不可', exact: true }),
      );
      const before = await saved();
      await openSheet();
      const bulk = page.locator('.bulk-complete');
      await press(bulk.locator('summary'));
      const checkbox = (id: string) =>
        bulk.getByRole('checkbox', { name: `${id}を一括完了の対象にする`, exact: true });
      await expect(checkbox('b')).toBeDisabled();
      await expect(bulk.locator('.bulk-apply')).toBeDisabled();
      await press(bulk.getByRole('button', { name: 'a系列を選択', exact: true }));
      await expect(bulk.locator('.bulk-review')).toContainText('6項目を選択');
      await press(bulk.getByRole('button', { name: '選択解除', exact: true }));
      await expect(checkbox('a1')).not.toBeChecked();
      await checkbox('c1').check();
      await press(bulk.getByRole('button', { name: '計数中だけ選択', exact: true }));
      await expect(checkbox('a1')).toBeChecked();
      await expect(checkbox('c1')).not.toBeChecked();
      await checkbox('c1').check();
      await checkbox('6').check();
      await expect(bulk.locator('.bulk-review')).toContainText('3項目を選択');
      await expect(bulk.locator('.bulk-review')).toContainText('a1: 1個');
      await expect(bulk.locator('.bulk-review')).toContainText('c1: 0個');
      await bulk.locator('.bulk-apply').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('bulk-review.png'), fullPage: true });
      await press(bulk.locator('.bulk-apply'));
      await closeSheet();
      const after = await saved(),
        s = after.sessions[0];
      for (const id of ['a1', 'c1', '6'])
        expect(s.statuses[id].observation_status).toBe('complete');
      expect(s.statuses.b).toEqual(before.sessions[0].statuses.b);
      expect(s.statuses.c2).toEqual(before.sessions[0].statuses.c2);
      expect(s.points).toEqual(before.sessions[0].points);
      expect(s.landmarks).toEqual(before.sessions[0].landmarks);
      const csv = await JSZip.loadAsync(await output('CSV 5種 ZIP'));
      const rows = Papa.parse<Record<string, string>>(
        await csv.file('papillae_counts.csv')!.async('string'),
        { header: true, skipEmptyLines: true },
      ).data;
      expect(rows[0]).toMatchObject({
        a1: '1',
        c1: '0',
        '6': '0',
        b: 'NA',
        c2: 'NA',
        papillae_total: 'NA',
      });
      await dismiss();
      if (mobile)
        await press(
          page.locator('.mobile-dock').getByRole('button', { name: '元に戻す', exact: true }),
        );
      else await page.keyboard.press('Control+z');
      expect(await saved()).toEqual(before);
      await dismiss();
      if (mobile)
        await press(
          page.locator('.mobile-dock').getByRole('button', { name: 'やり直す', exact: true }),
        );
      else await page.keyboard.press('Control+y');
      expect(await saved()).toEqual(after);
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      await page.reload();
      await expect(page.getByRole('status')).toHaveText('ローカル保存済み');
      expect(await saved()).toEqual(after);
      await openSheet();
      await press(bulk.locator('summary'));
      await expect(checkbox('a1')).toBeDisabled();
      await press(bulk.getByRole('button', { name: '未完了をすべて選択', exact: true }));
      await expect(bulk.locator('.bulk-review')).toContainText('28項目を選択');
      await press(bulk.getByRole('button', { name: '選択解除', exact: true }));
      await expect(bulk.locator('.bulk-apply')).toBeDisabled();
      await checkbox('a2').check();
      await closeSheet();
      if (mobile)
        await press(
          page
            .locator('.mobile-dock')
            .getByRole('button', { name: '画像・個体情報を開く', exact: true }),
        );
      await press(page.getByRole('button', { name: '別セッションを作成', exact: true }));
      await closeSheet();
      await dismiss();
      await openSheet();
      await press(bulk.locator('summary'));
      await expect(bulk.locator('.bulk-review')).toContainText('0項目を選択');
      await expect(bulk.locator('.bulk-apply')).toBeDisabled();
      expect(errors).toEqual([]);
    });
  });
}
