import type { GenerationMode, ModelDescriptor } from '@/lib/ai/contracts';

/** 目录接口返回的模型：就是全局契约里的 ModelDescriptor，原样透传 */
export type CatalogModel = ModelDescriptor;

export interface StyleItem {
  id: string;
  slug: string;
  nameI18n: Record<string, string>;
  category: string;
  tags: string[];
  thumbnailUrl: string;
  promptSuffix: string;
  negativeSuffix: string | null;
  defaultParams: Record<string, unknown> | null;
  recommendedModelId: string | null;
  ownerUserId: string | null;
}

/**
 * 「形象」：用户自建的角色，提示词里用 @[名字] 引用。
 *
 * 与 StyleItem 的区别是它**只属于创建者**（没有 curated 那一套），
 * 而且它影响的不只是画风 —— description 会被拼进提示词，url 会作为
 * role='subject' 的参考图传给支持它的模型。
 *
 * ★ 参考图是可选的，这就是「文字形象 / 图片形象」的分界：
 *   assetId === null → 文字形象，只能注入 description（任何模型都能用）
 *   assetId !== null → 图片形象，在实测支持 subject 的模型上才会额外带上这张图
 *   url/width/height 跟着 assetId 一起为空，渲染缩略图前必须判空。
 */
export interface CharacterItem {
  id: string;
  name: string;
  description: string;
  assetId: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface PromptItem {
  id: string;
  slug: string;
  titleI18n: Record<string, string>;
  prompt: string;
  negativePrompt: string | null;
  category: string;
  tags: string[];
  recommendedModelId: string | null;
}

export interface GenerationImageDTO {
  id: string;
  index: number;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  /** 签名 URL，1 小时有效；未完成时为 null */
  url: string | null;
  thumbUrl: string | null;
  /** 24px webp 的 dataURI，用于 blur-up */
  placeholder: string | null;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
  seed: string | null;
  nsfw: boolean;
  favorited: boolean;
  errorMessage: string | null;
}

export type GenerationStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELED';

export interface GenerationDTO {
  id: string;
  mode: GenerationMode;
  status: GenerationStatus;
  modelId: string;
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: string;
  resolution: string;
  batchCount: number;
  seed: string | null;
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
  createdAt: string;
  finishedAt: string | null;
  images: GenerationImageDTO[];
}

/** 提交接口的返回 */
export interface CreateGenerationResult {
  generationId: string;
  status: GenerationStatus;
  creditsHeld: number;
  costPerImage: number;
  batchCount: number;
  deduped: boolean;
}

// ───────────────────────── 账号中心 ─────────────────────────

export type LedgerKind =
  | 'SIGNUP_BONUS'
  | 'DAILY_GRANT'
  | 'ADMIN_GRANT'
  | 'GENERATION_HOLD'
  | 'GENERATION_SETTLE'
  | 'GENERATION_REFUND'
  | 'ADJUSTMENT';

export interface LedgerRowDTO {
  id: string;
  kind: LedgerKind;
  delta: number;
  balanceAfter: number;
  grossCost: number | null;
  modelId: string | null;
  generationId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface MeStatsDTO {
  /** 近 14 天的净消耗，已补齐没有消耗的日子 */
  days: { day: string; spent: number }[];
  totalEarned: number;
  totalSpent: number;
  generations: number;
  images: number;
}

// ───────────────────────── 探索广场 ─────────────────────────

export interface ExploreCardDTO {
  id: string;
  slug: string;
  titleI18n: Record<string, string>;
  descriptionI18n: Record<string, string> | null;
  coverUrl: string;
  tags: string[];
  category: string | null;
  featured: boolean;
  modelId: string | null;
  /** 来自 params，瀑布流卡片先按它占位 */
  aspectRatio: string;
  viewCount: number;
  likeCount: number;
  publishedAt: string | null;
}

/** 一键同款要复现的参数，存在 ExplorePost.params 里 */
export interface ExploreParams {
  seed?: string;
  aspectRatio?: string;
  resolution?: string;
  guidance?: number;
}

export interface ExploreDetailDTO extends ExploreCardDTO {
  prompt: string;
  negativePrompt: string | null;
  stylePresetId: string | null;
  params: ExploreParams;
}

// ───────────────────────── 收藏夹集合 ─────────────────────────

/** 卡片墙用。封面的签名 URL 由服务端现算，故与详情里的 collection 不同形。 */
export interface CollectionDTO {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  coverUrl: string | null;
  coverPlaceholder: string | null;
  updatedAt: string;
}

export interface CollectionDetailDTO {
  collection: Omit<CollectionDTO, 'coverUrl' | 'coverPlaceholder'>;
  items: GenerationImageDTO[];
  nextCursor: string | null;
}
