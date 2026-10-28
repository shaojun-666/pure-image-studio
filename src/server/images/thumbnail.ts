import sharp from 'sharp';

/** 网格缩略图长边 */
const THUMB_EDGE = 768;
/** blur-up 占位图长边 */
const PLACEHOLDER_EDGE = 24;

export interface DerivedAssets {
  width: number;
  height: number;
  hasAlpha: boolean;
  thumb: Buffer;
  /** 24px webp 的 data URI，直接内联进 <img src> 做 blur-up */
  placeholder: string;
}

/**
 * 一次性派生缩略图与占位图。worker 落盘时调用，请求路径上永远不跑 sharp。
 */
export async function deriveAssets(data: Buffer): Promise<DerivedAssets> {
  const meta = await sharp(data).metadata();

  const [thumb, ph] = await Promise.all([
    sharp(data)
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
    sharp(data)
      .resize(PLACEHOLDER_EDGE, PLACEHOLDER_EDGE, { fit: 'inside' })
      .webp({ quality: 40 })
      .toBuffer(),
  ]);

  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    hasAlpha: meta.hasAlpha ?? false,
    thumb,
    placeholder: `data:image/webp;base64,${ph.toString('base64')}`,
  };
}
