import UTIF from 'utif';
import { emptyMetadata, now, uid, type ImageRecord } from './domain';
export function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('ファイルを読み込めません'));
    r.readAsDataURL(blob);
  });
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('画像をデコードできません'));
    im.src = src;
  });
}
export async function sha256(data: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
}
export async function importImage(file: File): Promise<{ image: ImageRecord; warning?: string }> {
  if (file.size > 200 * 1024 * 1024) throw new Error('1画像200 MB以下で読み込んでください');
  const bytes = await file.arrayBuffer(),
    original = await dataUrl(file);
  const canvas = document.createElement('canvas');
  let warning: string | undefined;
  if (/\.tiff?$/i.test(file.name)) {
    const pages = UTIF.decode(bytes);
    if (!pages.length) throw new Error('TIFFに画像がありません');
    UTIF.decodeImage(bytes, pages[0]);
    const page = pages[0];
    if (page.width * page.height > 40_000_000)
      throw new Error('表示用画像は4000万画素以下で用意してください');
    canvas.width = page.width;
    canvas.height = page.height;
    const rgba = UTIF.toRGBA8(page);
    canvas
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(rgba), page.width, page.height), 0, 0);
    if (pages.length > 1)
      warning = `${file.name}: 複数ページTIFFの先頭ページを表示します（元ファイル全体は保存）`;
  } else {
    if (!/\.(png|jpe?g)$/i.test(file.name)) throw new Error('JPG・PNG・TIFFを選択してください');
    const im = await loadImage(original);
    if (im.naturalWidth * im.naturalHeight > 40_000_000)
      throw new Error('表示用画像は4000万画素以下で用意してください');
    canvas.width = im.naturalWidth;
    canvas.height = im.naturalHeight;
    canvas.getContext('2d')!.drawImage(im, 0, 0);
  }
  return {
    image: {
      image_id: uid(),
      image_filename: file.name,
      width: canvas.width,
      height: canvas.height,
      sha256: await sha256(bytes),
      original_data_url: original,
      display_data_url: canvas.toDataURL('image/png'),
      metadata: emptyMetadata(),
      created_at: now(),
    },
    warning,
  };
}
export type DisplaySettings = {
  brightness: number;
  contrast: number;
  gamma: number;
  channel: 'RGB' | 'R' | 'G' | 'B';
};
export const DEFAULT_DISPLAY: DisplaySettings = {
  brightness: 0,
  contrast: 1,
  gamma: 1,
  channel: 'RGB',
};
export function adjustedImage(im: HTMLImageElement, settings: DisplaySettings): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(im, 0, 0);
  if (
    settings.brightness === 0 &&
    settings.contrast === 1 &&
    settings.gamma === 1 &&
    settings.channel === 'RGB'
  )
    return c;
  const frame = ctx.getImageData(0, 0, c.width, c.height);
  const lut = Array.from({ length: 256 }, (_, i) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round(
          255 *
            Math.pow(
              Math.max(
                0,
                Math.min(1, (i / 255 - 0.5) * settings.contrast + 0.5 + settings.brightness),
              ),
              1 / settings.gamma,
            ),
        ),
      ),
    ),
  );
  const channel = settings.channel === 'RGB' ? -1 : ['R', 'G', 'B'].indexOf(settings.channel);
  for (let i = 0; i < frame.data.length; i += 4) {
    if (channel < 0) {
      for (let j = 0; j < 3; j++) frame.data[i + j] = lut[frame.data[i + j]];
    } else {
      const val = lut[frame.data[i + channel]];
      frame.data[i] = frame.data[i + 1] = frame.data[i + 2] = val;
    }
  }
  ctx.putImageData(frame, 0, 0);
  return c;
}
