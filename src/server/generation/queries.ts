import type { GenerationImage } from '@prisma/client';
import { DB_TO_MODE } from '@/lib/ai/contracts';
import { storage } from '../storage';

/** 终态：SSE 可以收尾了 */
export const TERMINAL_STATUSES = [
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'CANCELED',
] as const;

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export type PublicImage = Awaited<ReturnType<typeof serializeImage>>;

/**
 * ★ 签名 URL 绝不入库：每次序列化时现算，因此不会出现过期的死链。
 */
export async function serializeImage(row: GenerationImage, favorited = false) {
  const done = row.status === 'SUCCEEDED' && !row.deletedAt;
  return {
    id: row.id,
    index: row.index,
    status: row.status,
    url: done ? await storage.signedUrl(row.storageKey) : null,
    thumbUrl: done && row.thumbKey ? await storage.signedUrl(row.thumbKey) : null,
    placeholder: row.placeholder,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    mimeType: row.mimeType,
    seed: row.seed?.toString() ?? null,
    nsfw: row.nsfwFlagged,
    favorited,
    errorMessage: row.errorMessage,
  };
}

export function serializeGeneration(g: {
  id: string;
  mode: string;
  status: string;
  modelId: string;
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: string;
  resolution: string;
  batchCount: number;
  seed: bigint | null;
  guidance: number | null;
  strength: number | null;
  stylePresetId: string | null;
  succeededCount: number;
  failedCount: number;
  costPerImage: number;
  creditsHeld: number;
  creditsSpent: number;
  creditsRefunded: number;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: Date;
  finishedAt: Date | null;
}) {
  return {
    id: g.id,
    // 出参统一回契约的 camelCase；DB 里存的是 TEXT_TO_IMAGE 这类枚举值。
    // 漏了这步，前端拿到的 mode 就查不到 `generator.modes.*` 的文案。
    mode: DB_TO_MODE[g.mode] ?? g.mode,
    status: g.status,
    modelId: g.modelId,
    prompt: g.prompt,
    negativePrompt: g.negativePrompt,
    aspectRatio: g.aspectRatio,
    resolution: g.resolution,
    batchCount: g.batchCount,
    seed: g.seed?.toString() ?? null,
    guidance: g.guidance,
    strength: g.strength,
    stylePresetId: g.stylePresetId,
    succeededCount: g.succeededCount,
    failedCount: g.failedCount,
    costPerImage: g.costPerImage,
    creditsHeld: g.creditsHeld,
    creditsSpent: g.creditsSpent,
    creditsRefunded: g.creditsRefunded,
    errorCode: g.errorCode,
    errorMessage: g.errorMessage,
    durationMs: g.durationMs,
    createdAt: g.createdAt,
    finishedAt: g.finishedAt,
  };
}
