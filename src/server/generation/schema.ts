import { z } from 'zod';
import {
  ASPECT_RATIOS,
  CONTROL_TYPES,
  REFERENCE_ROLES,
  RESOLUTIONS,
  type ControlType,
  type ReferenceRole,
} from '@/lib/ai/contracts';

/** 客户端只传 assetId，URL / 尺寸由服务端解析 —— 避免客户端伪造任意 URL 给 provider */
const referenceRef = z.object({
  assetId: z.string().min(1),
  role: z.enum(REFERENCE_ROLES),
  weight: z.number().min(0).max(1).optional(),
  controlType: z.enum(CONTROL_TYPES).optional(),
});

const common = {
  modelId: z.string().min(1),
  /** 客户端每次点击生成一个新 uuid；重复提交靠它去重 */
  idempotencyKey: z.string().min(8).max(64),
  prompt: z.string().min(1).max(4000),
  negativePrompt: z.string().max(2000).optional(),
  aspectRatio: z.enum(ASPECT_RATIOS),
  resolution: z.enum(RESOLUTIONS),
  batchCount: z.number().int().min(1).max(8),
  seed: z
    .string()
    .regex(/^\d{1,20}$/, 'seed 必须是十进制字符串')
    .optional(),
  guidance: z.number().min(0).max(30).optional(),
  stylePresetId: z.string().optional(),
  references: z.array(referenceRef).max(9).optional(),
  /**
   * 本次生成引用的「形象」id。提示词里写的是 @[名字]，真正要传的 id 由客户端
   * 按名字反查后放在这里 —— 服务端不解析提示词来找形象，避免名字里有特殊字符时
   * 出现歧义。上限 3 与「一张底图 + 一个风格 + 一个形象」的厂商上限对齐。
   */
  characters: z.array(z.string().min(1)).max(3).optional(),
  parentImageId: z.string().optional(),
  parentGenerationId: z.string().optional(),
};

const expand = z.object({
  top: z.number().int().min(0).max(4096),
  right: z.number().int().min(0).max(4096),
  bottom: z.number().int().min(0).max(4096),
  left: z.number().int().min(0).max(4096),
});

export const generateBodySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('textToImage'), ...common }),

  z.object({
    mode: z.literal('imageToImage'),
    ...common,
    initAssetId: z.string().min(1),
    // 可选：不支持强度调节的模型（方舟 / ofox）不会带这个字段，带上会被能力校验挡下
    strength: z.number().min(0).max(1).optional(),
  }),

  z.object({
    mode: z.literal('inpaint'),
    ...common,
    initAssetId: z.string().min(1),
    maskAssetId: z.string().min(1),
  }),

  z.object({
    mode: z.literal('outpaint'),
    ...common,
    initAssetId: z.string().min(1),
    expand,
  }),

  z.object({
    mode: z.literal('removeBackground'),
    ...common,
    initAssetId: z.string().min(1),
    returnAlpha: z.boolean().default(true),
  }),

  z.object({
    mode: z.literal('upscale'),
    ...common,
    initAssetId: z.string().min(1),
    factor: z.union([z.literal(2), z.literal(4)]),
    faceEnhance: z.boolean().optional(),
  }),

  z.object({
    mode: z.literal('styleTransfer'),
    ...common,
    initAssetId: z.string().min(1),
    styleAssetId: z.string().min(1),
    styleStrength: z.number().min(0).max(1),
  }),

  z.object({
    mode: z.literal('removeObject'),
    ...common,
    initAssetId: z.string().min(1),
    maskAssetId: z.string().min(1),
  }),
]);

export type GenerateBody = z.infer<typeof generateBodySchema>;

// ───────────────────────── 落库形状 ─────────────────────────

/**
 * Generation.params 的内容。提交时写入，执行时读回 ——
 * 因此 worker 崩溃重跑不需要重新问客户端要任何东西。
 */
export interface StoredRef {
  assetId: string;
  role: ReferenceRole;
  weight?: number;
  controlType?: ControlType;
}

/** 形象在提交那一刻的样子 */
export interface CharacterSnapshot {
  id: string;
  name: string;
  description: string;
}

export interface StoredParams {
  /** init / style / 普通参考图统一放这里，按 role 区分。形象参考图 role='subject' */
  references?: StoredRef[];
  /**
   * 本次引用的形象快照。
   *
   * ★ 刻意存**快照**，而不是像 stylePreset 那样执行期回查库（见 executor.ts 的风格后缀）。
   *   两者差别在这：风格改名只影响画风，名字对不上无非是不加后缀；
   *   而形象是靠 `@[名字]` 这个字面量去替换的，改名之后替换会**静默失配** ——
   *   厂商收到的是字面量 "@[旧名]"，图照出、钱照扣，没人会发现。
   *   存快照则执行期完全不依赖库里的当前状态，已提交的任务永远可复现。
   */
  characters?: CharacterSnapshot[];
  /**
   * 描述注入后的提示词，就是真正发给厂商的那份。
   * 与 Generation.prompt（用户原文，含 @[名字]）分开存：原文留给历史列表和 Remix 显示。
   */
  promptExpanded?: string;
  expand?: { top: number; right: number; bottom: number; left: number };
  factor?: 2 | 4;
  returnAlpha?: boolean;
  styleStrength?: number;
  faceEnhance?: boolean;
}
