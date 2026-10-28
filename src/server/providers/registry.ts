import type {
  AspectRatio,
  ControlType,
  GenerationMode,
  ModelDescriptor,
  ReferenceRole,
  Resolution,
} from '@/lib/ai/contracts';
import { perImageCost } from '@/lib/ai/pricing';
import { errors } from '@/types/api';
import { prisma } from '../db';
import { findInCatalog, flatCatalog } from './index';

/** 全局单次批量上限（与 UI 的 1–8 一致） */
export const MAX_BATCH = 8;

/**
 * 代码目录 ⨝ 数据库行：
 *   代码是 capabilities / creditCost / tier 的权威来源（改了要重新部署）
 *   数据库是 enabled / sortOrder / 价格覆盖 / 徽章 的权威来源（后台可改）
 */
export async function getEffectiveModel(
  modelId: string,
): Promise<ModelDescriptor> {
  const base = findInCatalog(modelId);
  if (!base) throw errors.modelNotFound(modelId);

  const row = await prisma.modelRegistry.findUnique({ where: { id: modelId } });
  // 还没 seed 过：以代码为准，便于全新环境直接跑
  if (!row) return base;
  /**
   * 这里**只看 enabled，不看 isVisible** —— 两者是不同的事：
   *   enabled: false   → 运营下架，不可提交（后台「下架」按钮走这条，验收也测这条）
   *   isVisible: false → 只是不放进用户的下拉框，仍可提交
   *
   * 分开的理由是 mock：它绝不该出现在用户面前，但 7 个验收脚本全靠它跑端到端
   * （真模型每跑一次都花钱）。若 isVisible 也拦提交，关掉 mock 就等于拆掉整个验收体系。
   */
  if (!row.enabled) throw errors.modelNotFound(modelId);

  return {
    ...base,
    creditCost: row.creditCostOverride ?? base.creditCost,
    badge: (row.badgeI18n as Record<string, string> | null) ?? base.badge,
    sortOrder: row.sortOrder,
  };
}

/**
 * 前端模型下拉框的数据源。与 getEffectiveModel 同规则，但一次 findMany 拿完。
 * 代码目录里没有的 DB 行直接忽略 —— 模型的存在性由代码决定。
 */
export async function listEffectiveModels(): Promise<ModelDescriptor[]> {
  const rows = await prisma.modelRegistry.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));

  return flatCatalog()
    .map((base) => {
      const row = byId.get(base.id);
      if (!row) return base;
      if (!row.enabled || !row.isVisible) return null;
      return {
        ...base,
        creditCost: row.creditCostOverride ?? base.creditCost,
        badge: (row.badgeI18n as Record<string, string> | null) ?? base.badge,
        sortOrder: row.sortOrder,
      } satisfies ModelDescriptor;
    })
    .filter((m): m is ModelDescriptor => m !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 后台模型表的数据源。与 listEffectiveModels 的差别只有一处：
 * **不过滤已下架的模型**，否则关掉一个模型后它就再也点不回来。
 * capabilities 仍然只来自代码目录 —— 后台能改的只有 enabled/排序/价格覆盖/徽章。
 */
export async function listAdminModels() {
  const rows = await prisma.modelRegistry.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));

  return flatCatalog()
    .map((base) => {
      const row = byId.get(base.id);
      return {
        ...base,
        enabled: row?.enabled ?? true,
        isVisible: row?.isVisible ?? true,
        sortOrder: row?.sortOrder ?? base.sortOrder,
        creditCostOverride: row?.creditCostOverride ?? null,
        badgeI18n: (row?.badgeI18n as Record<string, string> | null) ?? null,
        // 库里还没这行时，后台的开关得能落库，所以把「要不要新建」也告诉前端
        hasRow: Boolean(row),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 提交前的能力校验。用轻量形状而不是完整 GenerateRequest ——
 * 提交时参考图还没解析成带 URL 的 ReferenceInput。
 */
export interface CapabilityCheck {
  mode: GenerationMode;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  batchCount: number;
  seed?: string;
  guidance?: number;
  hasInitImage?: boolean;
  hasMask?: boolean;
  hasStrength?: boolean;
  roles?: { role: ReferenceRole; controlType?: ControlType }[];
}

/** 违规抛 422，错误信息点名是哪个模式 / 哪个参数不支持 */
export function assertSupported(
  model: ModelDescriptor,
  c: CapabilityCheck,
): void {
  const cap = model.capabilities;
  const name = model.displayName.zh;

  if (!cap.modes[c.mode]) {
    throw errors.unsupported(`${name} 不支持该生成模式`);
  }
  if (c.hasInitImage && cap.maxReferenceImages === 0) {
    throw errors.unsupported(`${name} 不支持以图生图`);
  }
  if (c.batchCount < 1 || c.batchCount > MAX_BATCH) {
    throw errors.unsupported(`单次最多生成 ${MAX_BATCH} 张`);
  }
  /**
   * ★ 模型自己的上限也要在这里挡。
   *   从前的唯一一道 maxBatch 校验在 executor 里 —— 也就是说超限的请求
   *   会先 200、先冻结积分、先进队列，跑到执行阶段才失败退款。
   *   这是提交时就能一眼看出的错，不该让用户等一轮再被退回。
   */
  if (c.batchCount > cap.maxBatch) {
    throw errors.unsupported(`${name} 单次最多生成 ${cap.maxBatch} 张`);
  }
  if (!cap.supportedAspectRatios.includes(c.aspectRatio)) {
    throw errors.unsupported(`${name} 不支持 ${c.aspectRatio} 画幅`);
  }
  if (!cap.supportedResolutions.includes(c.resolution)) {
    throw errors.unsupported(`${name} 不支持 ${c.resolution} 分辨率`);
  }
  if (c.negativePrompt && !cap.supportsNegativePrompt) {
    throw errors.unsupported(`${name} 不支持反向提示词`);
  }
  if (c.seed && !cap.supportsSeed) {
    throw errors.unsupported(`${name} 不支持固定种子`);
  }
  if (c.guidance !== undefined && !cap.supportsGuidance) {
    throw errors.unsupported(`${name} 不支持引导强度`);
  }
  if (c.hasMask && !cap.supportsMask) {
    throw errors.unsupported(`${name} 不支持蒙版编辑`);
  }
  if (c.hasStrength && !cap.supportsStrength) {
    throw errors.unsupported(`${name} 不支持强度调节`);
  }
  if (c.prompt.length > cap.maxPromptChars) {
    throw errors.unsupported(`提示词最长 ${cap.maxPromptChars} 字`);
  }

  const roles = c.roles ?? [];
  const refCount = roles.filter((r) => r.role !== 'init').length;
  if (refCount > cap.maxReferenceImages) {
    throw errors.unsupported(`${name} 最多接受 ${cap.maxReferenceImages} 张参考图`);
  }
  for (const r of roles) {
    if (!cap.referenceRoles.includes(r.role)) {
      throw errors.unsupported(`${name} 不支持「${r.role}」类型的参考图`);
    }
    if (r.controlType && !cap.controlTypes.includes(r.controlType)) {
      throw errors.unsupported(`${name} 不支持 ${r.controlType} 控制`);
    }
  }
}

/** 单张实际扣费（含模式倍率） */
export function effectiveCostPerImage(
  model: ModelDescriptor,
  mode: GenerationMode,
): number {
  return perImageCost(model, mode);
}
