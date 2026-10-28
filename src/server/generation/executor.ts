import type { Generation } from '@prisma/client';
import type {
  AspectRatio,
  GenerateRequest,
  ReferenceInput,
  Resolution,
} from '@/lib/ai/contracts';
import { settleGeneration } from '../credits/balance';
import { prisma } from '../db';
import { env } from '../env';
import { scopedLogger } from '../logger';
import { findInCatalog, getProvider } from '../providers';
import { ProviderError, toProviderErrorShape } from '../providers/errors';
import type { ProviderErrorShape } from '../providers/types';
import { storage } from '../storage';
import { persistImages } from './persist';
import type { StoredParams, StoredRef } from './schema';

/** 可重试错误最多试这么多次，之后全额退款 */
const MAX_ATTEMPTS = 3;
/** 单次轮询调用的超时（不是整单 deadline） */
const POLL_CALL_TIMEOUT_MS = 30_000;

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) {
    throw new ProviderError('invalid_request', `缺少必需的${what}`);
  }
  return v;
}

/** Asset → 带短时效签名 URL 的 ReferenceInput，provider 可直接 fetch */
async function toRef(
  userId: string,
  r: StoredRef,
): Promise<ReferenceInput> {
  const asset = await prisma.asset.findFirst({
    where: { id: r.assetId, userId },
  });
  if (!asset) {
    throw new ProviderError('invalid_request', `参考图已失效：${r.assetId}`);
  }
  return {
    role: r.role,
    assetId: asset.id,
    /**
     * ★ 地址必须绝对化，这是本函数唯一的出口，所以修在这里。
     *
     * local 驱动的 signedUrl 返回的是相对路径（storage/local.ts：「同进程，不需要绝对域名」）,
     * 浏览器当 <img src> 用没问题，但 provider 拿着它去 fetch、或转手发给第三方厂商（百炼 / 方舟 / ofox）
     * 就是废地址 —— 上面那句「provider 可直接 fetch」对 local 驱动本来是不成立的。
     * oss 驱动返回的已经是绝对地址，而 new URL 对绝对地址是幂等的，两种驱动通吃。
     */
    url: new URL(
      await storage.signedUrl(asset.storageKey, { expiresIn: 3600 }),
      env.NEXT_PUBLIC_SITE_URL,
    ).toString(),
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    weight: r.weight,
    controlType: r.controlType,
  };
}

/**
 * 从数据库行重建请求。worker 因此完全无状态 ——
 * 崩溃后重跑只需要这一个 row，不必回头问客户端要任何东西。
 */
async function buildRequest(gen: Generation): Promise<GenerateRequest> {
  const params = (gen.params ?? {}) as StoredParams;
  const refs = params.references ?? [];

  // 形象描述注入后的提示词。没引形象（或形象没写描述）时提交那步就不会存它，
  // 这时原文即注入版 —— 见 create.ts 的 resolveCharacters
  let prompt = params.promptExpanded ?? gen.prompt;
  let negativePrompt = gen.negativePrompt ?? undefined;

  // 风格预设：promptSuffix 追加到正向，negativeSuffix 追加到反向
  if (gen.stylePresetId) {
    const style = await prisma.stylePreset.findUnique({
      where: { id: gen.stylePresetId },
      select: { promptSuffix: true, negativeSuffix: true },
    });
    /**
     * ★ 风格后缀必须放在**最前面**，不能追加到末尾。
     *
     * 实测（scripts/gen-samples.ts 出那 30 张风格缩略图时的对照组）：
     * 用户的描述越长，写在末尾的风格词越容易被淹没 —— 30 张缩略图当初全是
     * 「同一个调子的插画」，「16 位像素」出来的根本不是像素画，就是这么来的。
     * 风格词打头，等于先把画风钉死，再用后面的描述去填内容。
     *
     * 代价是用户写的那句话不再排在第一位，但出图质量优先。
     */
    if (style?.promptSuffix) prompt = `${style.promptSuffix}, ${prompt}`;
    if (style?.negativeSuffix) {
      negativePrompt = negativePrompt
        ? `${negativePrompt}, ${style.negativeSuffix}`
        : style.negativeSuffix;
    }
  }

  const common = {
    prompt,
    negativePrompt,
    aspectRatio: gen.aspectRatio as AspectRatio,
    resolution: gen.resolution as Resolution,
    batchCount: gen.batchCount,
    seed: gen.seed?.toString(),
    guidance: gen.guidance ?? undefined,
  };

  const initRef = refs.find((r) => r.role === 'init');
  const styleRef = refs.find((r) => r.role === 'style');
  const extraRefs = refs.filter(
    (r) => r.role !== 'init' && r.role !== 'style',
  );

  const [initImage, styleImage, references, mask] = await Promise.all([
    initRef ? toRef(gen.userId, initRef) : undefined,
    styleRef ? toRef(gen.userId, styleRef) : undefined,
    Promise.all(extraRefs.map((r) => toRef(gen.userId, r))),
    gen.maskAssetId
      ? toRef(gen.userId, { assetId: gen.maskAssetId, role: 'init' })
      : undefined,
  ]);

  switch (gen.mode) {
    case 'TEXT_TO_IMAGE':
      return { ...common, mode: 'textToImage', references };
    case 'IMAGE_TO_IMAGE':
      return {
        ...common,
        mode: 'imageToImage',
        initImage: must(initImage, '原图'),
        strength: gen.strength ?? 0.6,
        references,
      };
    case 'INPAINT':
      return {
        ...common,
        mode: 'inpaint',
        initImage: must(initImage, '原图'),
        mask: must(mask, '蒙版'),
        references,
      };
    case 'OUTPAINT':
      return {
        ...common,
        mode: 'outpaint',
        initImage: must(initImage, '原图'),
        expand: params.expand ?? { top: 0, right: 0, bottom: 0, left: 0 },
        references,
      };
    case 'REMOVE_BACKGROUND':
      return {
        ...common,
        mode: 'removeBackground',
        initImage: must(initImage, '原图'),
        returnAlpha: params.returnAlpha ?? true,
        references,
      };
    case 'UPSCALE':
      return {
        ...common,
        mode: 'upscale',
        initImage: must(initImage, '原图'),
        factor: params.factor ?? 2,
        faceEnhance: params.faceEnhance,
        references,
      };
    case 'STYLE_TRANSFER':
      return {
        ...common,
        mode: 'styleTransfer',
        initImage: must(initImage, '原图'),
        styleImage: must(styleImage, '风格图'),
        styleStrength: gen.strength ?? 0.7,
        references,
      };
    case 'REMOVE_OBJECT':
      return {
        ...common,
        mode: 'removeObject',
        initImage: must(initImage, '原图'),
        mask: must(mask, '蒙版'),
        references,
      };
  }
}

// ───────────────────────── 状态收尾 ─────────────────────────

/**
 * 结算。成功张数一律从库里数，不信任内存里的计数 ——
 * 重试路径上可能已经落了部分图片，数库才是真话。
 */
async function settle(
  gen: Generation,
  startedAtMs: number,
  error?: ProviderErrorShape,
): Promise<void> {
  const succeeded = await prisma.generationImage.count({
    where: { generationId: gen.id, status: 'SUCCEEDED' },
  });

  const { spent, refunded } = await settleGeneration({
    generationId: gen.id,
    costPerImage: gen.costPerImage,
    succeededCount: succeeded,
    batchCount: gen.batchCount,
  });

  const status =
    succeeded === 0
      ? 'FAILED'
      : succeeded < gen.batchCount
        ? 'PARTIAL'
        : 'SUCCEEDED';

  await prisma.generation.update({
    where: { id: gen.id },
    data: {
      status,
      succeededCount: succeeded,
      failedCount: gen.batchCount - succeeded,
      creditsSpent: spent,
      creditsRefunded: refunded,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAtMs,
      lockedAt: null,
      lockedBy: null,
      nextPollAt: null,
      errorCode: error?.code ?? null,
      errorMessage: error?.message?.slice(0, 2000) ?? null,
    },
  });

  scopedLogger({ generationId: gen.id }).info('generation settled', {
    status,
    succeeded,
    spent,
    refunded,
  });
}

/** 释放租约去轮询；到期后会被 claim 的轮询分支重新捞起来 */
async function releaseForPoll(genId: string, nextPollAt: Date): Promise<void> {
  await prisma.generation.update({
    where: { id: genId },
    data: {
      status: 'RUNNING',
      nextPollAt,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

async function handleError(
  gen: Generation,
  shape: ProviderErrorShape,
  startedAtMs: number,
): Promise<void> {
  const log = scopedLogger({ generationId: gen.id });

  if (shape.retryable && gen.attempts < MAX_ATTEMPTS) {
    const backoffMs = Math.min(30_000, 1000 * 2 ** gen.attempts);
    await prisma.generation.update({
      where: { id: gen.id },
      data: {
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
        nextPollAt: new Date(Date.now() + backoffMs),
        errorCode: shape.code,
        errorMessage: shape.message.slice(0, 2000),
      },
    });
    log.warn('generation retry scheduled', {
      code: shape.code,
      attempt: gen.attempts,
      backoffMs,
    });
    return;
  }

  // 不可重试，或次数用尽 → 已成功的那几张照价，其余全额退回
  await settle(gen, startedAtMs, shape);
}

// ───────────────────────── 主流程 ─────────────────────────

/**
 * 执行一个已被 worker 领取的任务。
 * 三条路径：异步轮询 / 异步首次提交 / 同步分块提交。
 */
export async function executeClaimed(gen: Generation): Promise<void> {
  const model = findInCatalog(gen.modelId);
  if (!model) {
    await settle(gen, gen.startedAt?.getTime() ?? Date.now(), {
      code: 'invalid_request',
      message: `模型已从代码目录移除：${gen.modelId}`,
      retryable: false,
    });
    return;
  }

  const provider = getProvider(gen.providerKey);
  const startedAtMs = gen.startedAt?.getTime() ?? Date.now();
  const deadline = startedAtMs + env.GENERATION_DEADLINE_MS;
  const log = scopedLogger({
    generationId: gen.id,
    modelId: gen.modelId,
    attempt: gen.attempts,
  });

  if (Date.now() >= deadline) {
    await settle(gen, startedAtMs, {
      code: 'timeout',
      message: '生成超时，未产出的部分已退回积分',
      retryable: false,
    });
    return;
  }

  const isPoll = gen.providerJobId !== null;
  const ac = new AbortController();
  const timer = setTimeout(
    () => ac.abort(),
    isPoll ? POLL_CALL_TIMEOUT_MS : env.PROVIDER_TIMEOUT_MS,
  );

  try {
    const req = await buildRequest(gen);
    const ctx = {
      signal: ac.signal,
      model,
      requestId: gen.id,
      userId: gen.userId,
      logger: log,
    };

    if (isPoll) {
      const res = await provider.poll!(
        { providerJobId: gen.providerJobId! },
        ctx,
      );
      if (res.status === 'running') {
        const next = Math.min(
          Date.now() + (res.retryAfterMs ?? env.POLL_INTERVAL_MS),
          deadline,
        );
        await releaseForPoll(gen.id, new Date(next));
        return;
      }
      if (res.status === 'failed') {
        await handleError(gen, res.error, startedAtMs);
        return;
      }
      await persistImages(gen, res.images);
      await settle(gen, startedAtMs);
      return;
    }

    if (model.capabilities.async) {
      // 异步 provider 一次提交一批：句柄是单个 jobId，因此不支持分块
      if (gen.batchCount > model.capabilities.maxBatch) {
        throw new ProviderError(
          'invalid_request',
          `该模型单次最多 ${model.capabilities.maxBatch} 张`,
        );
      }
      const res = await provider.submit(req, ctx);
      if (res.kind === 'sync') {
        await persistImages(gen, res.images);
        await settle(gen, startedAtMs);
        return;
      }
      await prisma.generation.update({
        where: { id: gen.id },
        data: {
          providerJobId: res.providerJobId,
          nextPollAt: new Date(Date.now() + res.pollAfterMs),
          lockedAt: null,
          lockedBy: null,
        },
      });
      log.info('generation handed off to polling', {
        pollAfterMs: res.pollAfterMs,
      });
      return;
    }

    // 同步 provider：按它的单次批量上限切块串行提交。
    // 这既让 maxBatch:1 的厂商能跑批量，也让内存占用有界。
    const chunkSize = Math.max(
      1,
      Math.min(model.capabilities.maxBatch, gen.batchCount),
    );

    /**
     * ★ 重试时从第一个「整块都已落盘」的位置接着跑。
     *
     * 分块是**串行且有序**的，所以失败发生在第 k 块时，前面的块必定都已成功。
     * 从前重试是从 offset = 0 重来：已经出好的那几块会被**再送一次上游**，
     * 白付一次钱，而且 persistImages 是按 (generationId, index) upsert 的，
     * 新图会盖掉旧图 —— 用户看到的那几张悄悄换成了另一批。
     */
    const done = new Set(
      (
        await prisma.generationImage.findMany({
          where: { generationId: gen.id, status: 'SUCCEEDED' },
          select: { index: true },
        })
      ).map((r) => r.index),
    );
    const chunkComplete = (start: number) => {
      const size = Math.min(chunkSize, gen.batchCount - start);
      for (let i = start; i < start + size; i++) if (!done.has(i)) return false;
      return true;
    };
    let offset = 0;
    while (offset < gen.batchCount && chunkComplete(offset)) offset += chunkSize;

    for (; offset < gen.batchCount; offset += chunkSize) {
      const size = Math.min(chunkSize, gen.batchCount - offset);

      /**
       * ★ 每块一个**独立**的超时，不能整单共用一个 AbortController。
       *   maxBatch:1 的厂商（默认模型 qwen-image-3 就是）chunkSize 就是 1，
       *   batchCount=8 等于连着打 8 次上游。从前这 8 次分摊同一个
       *   PROVIDER_TIMEOUT_MS，跑到中后段那次调用会被 abort，整单落成
       *   「部分失败 + 退分」—— 演示里那个「部分失败」就是这么来的。
       *   单次调用该有自己的预算，整单总时长仍由上面的 deadline 兜底。
       */
      const budget = Math.max(
        0,
        Math.min(env.PROVIDER_TIMEOUT_MS, deadline - Date.now()),
      );
      const chunkAc = new AbortController();
      const chunkTimer = setTimeout(() => chunkAc.abort(), budget);

      let res;
      try {
        res = await provider.submit(
          { ...req, batchCount: size },
          { ...ctx, signal: chunkAc.signal },
        );
      } finally {
        clearTimeout(chunkTimer);
      }

      if (res.kind !== 'sync') {
        throw new ProviderError(
          'invalid_request',
          'provider 能力声明为同步，却返回了异步句柄',
        );
      }
      // 分块后 provider 的 index 是块内的，这里映射回全局 index
      await persistImages(
        gen,
        res.images.map((img) => ({ ...img, index: offset + img.index })),
      );
    }
    await settle(gen, startedAtMs);
  } catch (e) {
    await handleError(gen, toProviderErrorShape(e), startedAtMs);
  } finally {
    clearTimeout(timer);
  }
}
