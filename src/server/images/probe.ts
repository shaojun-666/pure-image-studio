import sharp from 'sharp';
import { errors } from '@/types/api';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_EDGE = 4096;

export interface ProbedUpload {
  data: Buffer;
  mimeType: string;
  width: number;
  height: number;
  /** 原图是否带 alpha —— 抠图 / 重绘的前置校验用得上 */
  hasAlpha: boolean;
}

const OUTPUT_MIME: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * 校验并净化上传：限大小、限尺寸、按 EXIF 方向摆正、剥掉全部元数据。
 * sharp 默认不写回 metadata，所以重新编码一次就等于剥 EXIF。
 */
export async function normalizeUpload(buf: Buffer): Promise<ProbedUpload> {
  if (buf.byteLength === 0) throw errors.validation('文件为空');
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw errors.validation(
      `文件超过 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB 上限`,
    );
  }

  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw errors.validation('无法解析的图片格式');
  }
  const mimeType = OUTPUT_MIME[meta.format ?? ''];
  if (!mimeType) {
    throw errors.validation('仅支持 PNG / JPEG / WebP');
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw errors.validation('无法读取图片尺寸');
  if (Math.max(width, height) > MAX_UPLOAD_EDGE) {
    throw errors.validation(`图片长边不得超过 ${MAX_UPLOAD_EDGE}px`);
  }

  const data = await sharp(buf)
    .rotate() // 按 EXIF 方向摆正（旋转后宽高可能互换）
    .toFormat(meta.format === 'jpeg' ? 'jpeg' : meta.format === 'png' ? 'png' : 'webp', {
      quality: 92,
    })
    .toBuffer();

  // 从成品读最终尺寸，避免自己处理 EXIF orientation 的宽高互换
  const out = await sharp(data).metadata();

  return {
    data,
    mimeType,
    width: out.width ?? width,
    height: out.height ?? height,
    hasAlpha: out.hasAlpha ?? false,
  };
}
