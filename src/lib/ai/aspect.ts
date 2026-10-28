import type { AspectRatio, Resolution } from './contracts';

/** 1K 档下的基准长边像素 */
const BASE_LONG_EDGE: Record<Resolution, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};

const RATIO_VALUE: Record<AspectRatio, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '21:9': 21 / 9,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
};

/** 对齐到 8 的倍数：多数扩散模型的隐空间要求 */
function align8(n: number): number {
  return Math.max(8, Math.round(n / 8) * 8);
}

/**
 * 宽高比 + 分辨率档 → 实际像素尺寸（长边对齐到 1K/2K/4K，短边等比缩放）。
 */
export function resolveDimensions(
  aspectRatio: AspectRatio,
  resolution: Resolution,
): { width: number; height: number } {
  const long = BASE_LONG_EDGE[resolution];
  const r = RATIO_VALUE[aspectRatio] ?? 1;

  if (r >= 1) {
    return { width: align8(long), height: align8(long / r) };
  }
  return { width: align8(long * r), height: align8(long) };
}

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  '1:1': '1:1',
  '4:3': '4:3',
  '3:4': '3:4',
  '16:9': '16:9',
  '9:16': '9:16',
  '21:9': '21:9',
  '3:2': '3:2',
  '2:3': '2:3',
};
