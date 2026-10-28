import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { MODE_TO_DB } from '@/lib/ai/contracts';
import { errors } from '@/types/api';
import { holdCredits } from '../credits/balance';
import { claimDailyGrant } from '../credits/daily-grant';
import { isUniqueViolation } from '../credits/ledger';
import { prisma } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import {
  assertSupported,
  effectiveCostPerImage,
  getEffectiveModel,
} from '../providers/registry';
import { assertRateLimit } from '../ratelimit';
import { notifyWorker } from '../worker';
import type {
  CharacterSnapshot,
  GenerateBody,
  StoredParams,
  StoredRef,
} from './schema';

export interface CreateResult {
  generationId: string;
  status: string;
  creditsHeld: number;
  costPerImage: number;
  batchCount: number;
  /** true = 命中幂等键，未重复扣费 */
  deduped: boolean;
}

function randomSeed(): string {
  return String(randomInt(1, 2 ** 31 - 1));
}

function collectRefs(body: GenerateBody): StoredRef[] {
  const out: StoredRef[] = [];
  if ('initAssetId' in body) out.push({ assetId: body.initAssetId, role: 'init' });
  if ('styleAssetId' in body) {
    out.push({ assetId: body.styleAssetId, role: 'style' });
  }
  if (body.references) out.push(...body.references);
  return out;
}

function modeParams(body: GenerateBody): Omit<StoredParams, 'references'> {
  const p: Omit<StoredParams, 'references'> = {};
  if ('expand' in body) p.expand = body.expand;
  if ('factor' in body) p.factor = body.factor;
  if ('returnAlpha' in body) p.returnAlpha = body.returnAlpha;
  if ('styleStrength' in body) p.styleStrength = body.styleStrength;
  if ('faceEnhance' in body) p.faceEnhance = body.faceEnhance;
  return p;
}

async function findExisting(userId: string, idempotencyKey: string) {
  return prisma.generation.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
    select: {
      id: true,
      status: true,
      creditsHeld: true,
      costPerImage: true,
      batchCount: true,
    },
  });
}

/** 参考图必须属于调用者 —— 否则可以拿别人的 assetId 去生成 */
async function assertAssetsOwned(
  userId: string,
  assetIds: (string | undefined)[],
): Promise<void> {
  const ids = [...new Set(assetIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return;
  const owned = await prisma.asset.count({
    where: { id: { in: ids }, userId },
  });
  if (owned !== ids.length) throw errors.notFound('参考图不存在');
}

interface ResolvedCharacters {
  snapshots: CharacterSnapshot[];
  /** 描述注入后的提示词 */
  prompt: string;
  /** 有参考图的形象各一项 role='subject'；文字形象不产生条目 */
  refs: StoredRef[];
}

/**
 * 把提示词里的 `@[名字]` 换成该形象的外形描述，并为**有参考图的**形象挂一张 subject 参考图。
 *
 * 两条路各自独立，互不依赖：
 *   - 注入描述 —— 任何模型都能用，但只是「把描述写死」，一致性弱
 *   - subject 参考图 —— 一致性真强，但只有实测认这张图的模型收得下
 * 模型不收参考图时只走前者：是否带上 refs 由调用处按能力白名单决定（见 createGeneration）。
 */
async function resolveCharacters(
  userId: string,
  ids: string[] | undefined,
  prompt: string,
): Promise<ResolvedCharacters> {
  if (!ids?.length) return { snapshots: [], prompt, refs: [] };

  const uniq = [...new Set(ids)];
  const rows = await prisma.character.findMany({
    where: { id: { in: uniq }, userId },
    select: { id: true, name: true, description: true, assetId: true },
  });
  if (rows.length !== uniq.length) throw errors.notFound('形象不存在');

  // 按客户端给的顺序（也就是提示词里出现的顺序）展开，保证同一段提示词
  // 每次提交得到完全一样的注入结果
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = uniq
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  let out = prompt;
  for (const c of ordered) {
    if (c.description) out = out.replaceAll(`@[${c.name}]`, c.description);
  }

  return {
    snapshots: ordered.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    })),
    prompt: out,
    refs: ordered.flatMap((c) =>
      /**
       * ★ 文字形象（没有参考图）**不产生 refs 条目**。
       *   StoredRef.assetId 是非空 string，放个 null 进去会一路漏到
       *   assertAssetsOwned 与 executor.toRef 的 asset.findFirst({ id: null })。
       */
      c.assetId ? [{ assetId: c.assetId, role: 'subject' as const }] : [],
    ),
  };
}

/**
 * 提交生成。
 * Generation 的 INSERT 与积分冻结在同一个事务里 —— 余额不足时整笔回滚，
 * 不会留下一条永远跑不起来的记录，也不会出现「扣了钱没任务」。
 */
export async function createGeneration(input: {
  userId: string;
  body: GenerateBody;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<CreateResult> {
  const { userId, body } = input;

  await assertRateLimit(
    userId,
    env.RATE_LIMIT_GENERATIONS_PER_5MIN,
    5 * 60_000,
  );

  // 幂等：先查一次，省掉重复请求的后续全部开销
  const dup = await findExisting(userId, body.idempotencyKey);
  if (dup) return { ...dup, generationId: dup.id, deduped: true };

  const model = await getEffectiveModel(body.modelId);
  // 形象要在能力校验之前解析出来：一来它的参考图要跟着一起过能力门，
  // 二来注入描述后提示词会变长，长度校验必须拿注入后的文本去比
  const chars = await resolveCharacters(userId, body.characters, body.prompt);
  /**
   * ★ subject 参考图只在**实测声明支持**的模型上带，而且还得有槽位。
   *   能力白名单的唯一权威是代码（见 providers/registry.ts），客户端不该为此负责 ——
   *   它照发 characters，由这里按当前模型决定要不要真把图递过去。
   *
   *   槽位要自己数一遍：厂商的参考图上限是所有非 init 图共用的，
   *   风格迁移本身已占 1 格（见 registry.ts:170 的算法）。不数就会出现
   *   「风格迁移 + 3 个形象」= 4 > 3，被 assertSupported 以「最多接受 3 张参考图」422 挡下 ——
   *   让用户选了形象反而提交失败，是最差的那种体验。超出的形象只注入描述，不报错。
   */
  const cap = model.capabilities;
  const ownRefs = collectRefs(body);
  const subjectSlots = Math.max(
    0,
    cap.maxReferenceImages - ownRefs.filter((r) => r.role !== 'init').length,
  );
  const refs = [
    ...ownRefs,
    ...(cap.referenceRoles.includes('subject') ? chars.refs.slice(0, subjectSlots) : []),
  ];

  assertSupported(model, {
    mode: body.mode,
    /**
     * ★ 传注入**之后**的提示词。那才是真正发给厂商的文本 ——
     *   拿原文去比 maxPromptChars，会让「原文刚好卡在上限、注入后超长」的请求
     *   一路放行到厂商那里才失败，钱已经冻了。
     */
    prompt: chars.prompt,
    negativePrompt: body.negativePrompt,
    aspectRatio: body.aspectRatio,
    resolution: body.resolution,
    batchCount: body.batchCount,
    seed: body.seed,
    guidance: body.guidance,
    hasInitImage: 'initAssetId' in body,
    hasMask: 'maskAssetId' in body,
    hasStrength: 'strength' in body || 'styleStrength' in body,
    roles: refs.map((r) => ({ role: r.role, controlType: r.controlType })),
  });

  // 惰性领取当日免费额度：0 余额的新用户第一次生成就能用上
  await claimDailyGrant(userId);

  await assertAssetsOwned(userId, [
    ...refs.map((r) => r.assetId),
    'maskAssetId' in body ? body.maskAssetId : undefined,
  ]);

  const costPerImage = effectiveCostPerImage(model, body.mode);
  const held = costPerImage * body.batchCount;
  const seed = BigInt(body.seed ?? randomSeed());
  const params: StoredParams = {
    references: refs,
    ...modeParams(body),
    characters: chars.snapshots.length ? chars.snapshots : undefined,
    // 没注入（没引形象，或形象没写描述）就不存，省得留一份与原文相同的副本
    promptExpanded: chars.prompt === body.prompt ? undefined : chars.prompt,
  };

  const data: Prisma.GenerationUncheckedCreateInput = {
    userId,
    modelId: model.id,
    mode: MODE_TO_DB[body.mode],
    status: 'PENDING',
    // 存**原文**（含 @[名字]）：历史列表与 Remix 都按它显示/回填，
    // 真正发给厂商的注入版在 params.promptExpanded
    prompt: body.prompt,
    negativePrompt: body.negativePrompt,
    aspectRatio: body.aspectRatio,
    resolution: body.resolution,
    batchCount: body.batchCount,
    seed,
    guidance: body.guidance,
    strength:
      'strength' in body
        ? body.strength
        : 'styleStrength' in body
          ? body.styleStrength
          : undefined,
    stylePresetId: body.stylePresetId,
    referenceAssetIds: refs.map((r) => r.assetId),
    maskAssetId: 'maskAssetId' in body ? body.maskAssetId : undefined,
    params: params as unknown as Prisma.InputJsonValue,
    parentImageId: body.parentImageId,
    parentGenerationId: body.parentGenerationId,
    providerKey: model.providerKey,
    costPerImage,
    creditsHeld: held,
    idempotencyKey: body.idempotencyKey,
    ip: input.ip ?? undefined,
    userAgent: input.userAgent ?? undefined,
  };

  try {
    const gen = await prisma.$transaction(
      async (tx) => {
        const created = await tx.generation.create({ data });
        await holdCredits(tx, {
          userId,
          amount: held,
          generationId: created.id,
          modelId: model.id,
        });
        return created;
      },
      { isolationLevel: 'ReadCommitted', timeout: 15_000 },
    );

    logger.info('generation created', {
      generationId: gen.id,
      userId,
      modelId: model.id,
      mode: body.mode,
      batchCount: body.batchCount,
      held,
    });
    notifyWorker();

    return {
      generationId: gen.id,
      status: gen.status,
      creditsHeld: held,
      costPerImage,
      batchCount: gen.batchCount,
      deduped: false,
    };
  } catch (e) {
    // 并发双击：另一个请求先落库了，返回它的结果，不重复扣费
    if (isUniqueViolation(e)) {
      const again = await findExisting(userId, body.idempotencyKey);
      if (again) return { ...again, generationId: again.id, deduped: true };
    }
    throw e;
  }
}
