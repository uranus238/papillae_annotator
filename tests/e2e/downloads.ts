import { expect, type Page } from '@playwright/test';
export type ExportedFile = { filename: string; buffer: Buffer };
// Default: exercise the real browser download. Optional capture mode validates the exact
// production Blob and filename when the host's post-download completion service stalls.
export async function exportedFile(
  page: Page,
  action: () => Promise<unknown>,
): Promise<ExportedFile> {
  if (process.env.PAPILLAE_CAPTURE_DOWNLOADS !== '1') {
    const event = page.waitForEvent('download');
    await action();
    const download = await event;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(Buffer.from(c));
    return { filename: download.suggestedFilename(), buffer: Buffer.concat(chunks) };
  }
  await page.evaluate(() => {
    const state = window as unknown as { __papillaeExports?: { filename: string; blob: Blob }[] };
    if (state.__papillaeExports) return;
    state.__papillaeExports = [];
    const urls = new Map<string, Blob>();
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = create(value);
      if (value instanceof Blob) urls.set(url, value);
      return url;
    };
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      urls.delete(url);
      revoke(url);
    };
    document.addEventListener(
      'click',
      (e) => {
        const link = e.target;
        if (!(link instanceof HTMLAnchorElement) || !link.hasAttribute('download')) return;
        const blob = urls.get(link.href);
        if (!blob) return;
        e.preventDefault();
        state.__papillaeExports!.push({ filename: link.download, blob });
        urls.delete(link.href);
      },
      true,
    );
  });
  await action();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __papillaeExports: { filename: string; blob: Blob }[] })
            .__papillaeExports.length,
      ),
    )
    .toBeGreaterThan(0);
  const captured = await page.evaluate(async () => {
    const entry = (
      window as unknown as { __papillaeExports: { filename: string; blob: Blob }[] }
    ).__papillaeExports.shift()!;
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(entry.blob);
    });
    return { filename: entry.filename, encoded };
  });
  return { filename: captured.filename, buffer: Buffer.from(captured.encoded, 'base64') };
}
