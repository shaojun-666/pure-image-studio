import type { GeneratedImage } from '@/lib/ai/contracts';
import { prisma } from '../db';
import { deriveAssets } from '../images/thumbnail';
import { logger } from '../logger';
import { keys, storage } from '../storage';

/**
 * 逐张落盘。三件事：
 *   1. 原图保持厂商原始字节，不重编码
 *   2. 派生 768px 网格缩略图 + 24px blur-up 占位图
 *   3. upsert 到 (generationId, index) —— 存储 key 是确定性的，
 *      worker 崩溃重跑只会覆盖同一个 blob，不会产生重复行或垃圾文件
 */
export async function persistImages(
  gen: { id: string; userId: string },
  images: GeneratedImage[],
): Promise<void> {
  for (const img of images) {
    const storageKey = keys.output(gen.userId, gen.id, img.index, img.mimeType);
    const thumbKey = keys.thumb(gen.userId, gen.id, img.index);

    try {
      const bytes = Buffer.from(img.data);
      const derived = await deriveAssets(bytes);

      await storage.put(storageKey, bytes, { contentType: img.mimeType });
      await storage.put(thumbKey, derived.thumb, { contentType: 'image/webp' });

      const row = {
        generationId: gen.id,
        userId: gen.userId,
        index: img.index,
        status: 'SUCCEEDED' as const,
        storageKey,
        thumbKey,
        placeholder: derived.placeholder,
        width: img.width || derived.width,
        height: img.height || derived.height,
        mimeType: img.mimeType,
        bytes: bytes.byteLength,
        seed: img.seed ? BigInt(img.seed) : undefined,
        revisedPrompt: img.revisedPrompt,
        nsfwFlagged: img.nsfw ?? false,
        errorMessage: null,
      };

      await prisma.generationImage.upsert({
        where: {
          generationId_index: { generationId: gen.id, index: img.index },
        },
        create: row,
        update: row,
      });
    } catch (e) {
      logger.error('persist image failed', {
        generationId: gen.id,
        index: img.index,
        message: e instanceof Error ? e.message : String(e),
      });
      // 留一行 FAILED，前端才能把这一格显示成错误而不是永远转圈
      const failed = {
        status: 'FAILED' as const,
        errorMessage: e instanceof Error ? e.message.slice(0, 500) : '落盘失败',
      };
      await prisma.generationImage.upsert({
        where: {
          generationId_index: { generationId: gen.id, index: img.index },
        },
        create: {
          generationId: gen.id,
          userId: gen.userId,
          index: img.index,
          storageKey,
          thumbKey,
          width: img.width,
          height: img.height,
          mimeType: img.mimeType,
          ...failed,
        },
        update: failed,
      });
    }
  }
}
