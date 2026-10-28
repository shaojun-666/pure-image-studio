/**
 * 存储 key 布局。确定性是关键：worker 崩溃重跑时同一个 (genId, index)
 * 必然算出同一个 key，因此重跑只会覆盖同一个 blob，不会产生垃圾。
 *
 * 一个 bucket、私有 ACL、两个前缀：
 *   u/*      → 一律走 signedUrl，1 小时有效
 *   public/* → 桶策略放开匿名只读，永久可缓存
 */

const pad = (n: number) => String(n).padStart(2, '0');

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export function extFor(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? 'bin';
}

export const keys = {
  /** 生成结果原图：保持厂商原始字节，不重编码 */
  output: (userId: string, genId: string, index: number, mimeType: string) =>
    `u/${userId}/gen/${genId}/${pad(index)}.${extFor(mimeType)}`,

  /** 网格缩略图（≤768px webp） */
  thumb: (userId: string, genId: string, index: number) =>
    `u/${userId}/gen/${genId}/t_${pad(index)}.webp`,

  asset: (userId: string, assetId: string, mimeType: string) =>
    `u/${userId}/asset/${assetId}.${extFor(mimeType)}`,

  assetMask: (userId: string, assetId: string) =>
    `u/${userId}/asset/${assetId}_mask.png`,
};
