/**
 * 全局模型契约。★ 这个文件不 import 任何 node 模块 ——
 * 服务端 provider 和 React 组件都从这里取类型，
 * 这是「接入新厂商零改前端」成立的物理基础。
 */

// ───────────────────────── 模式与参数枚举 ─────────────────────────

export const GENERATION_MODES = [
  'textToImage',
  'imageToImage',
  'inpaint',
  'outpaint',
  'removeBackground',
  'upscale',
  'styleTransfer',
  'removeObject',
] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

/**
 * 与 prisma 的 GenerationMode 枚举一一对应。
 * `as const` 让取值是字面量而非 string —— Prisma 的枚举字段才收得下。
 */
export const MODE_TO_DB = {
  textToImage: 'TEXT_TO_IMAGE',
  imageToImage: 'IMAGE_TO_IMAGE',
  inpaint: 'INPAINT',
  outpaint: 'OUTPAINT',
  removeBackground: 'REMOVE_BACKGROUND',
  upscale: 'UPSCALE',
  styleTransfer: 'STYLE_TRANSFER',
  removeObject: 'REMOVE_OBJECT',
} as const satisfies Record<GenerationMode, string>;
export const DB_TO_MODE: Record<string, GenerationMode> = Object.fromEntries(
  Object.entries(MODE_TO_DB).map(([k, v]) => [v, k as GenerationMode]),
);

export const ASPECT_RATIOS = [
  '1:1',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
  '21:9',
  '3:2',
  '2:3',
] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const RESOLUTIONS = ['1K', '2K', '4K'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const REFERENCE_ROLES = [
  'reference',
  'style',
  'subject',
  'control',
  'init',
] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];

export const CONTROL_TYPES = ['pose', 'depth', 'canny', 'lineart'] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];

export type ModelTier = 'FAST' | 'QUALITY' | 'ULTRA';

// ───────────────────────── 能力描述 ─────────────────────────

/**
 * UI 能启用哪些控件的唯一真相来源。
 * 模型不支持某模式时，前端自动置灰，无需改任何前端代码。
 */
export interface ModelCapabilities {
  modes: Record<GenerationMode, boolean>;
  maxBatch: number;
  /** 0 = 不支持参考图；最多 9 */
  maxReferenceImages: number;
  referenceRoles: ReferenceRole[];
  controlTypes: ControlType[];
  supportedAspectRatios: AspectRatio[];
  supportedResolutions: Resolution[];
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  supportsGuidance: boolean;
  /** inpaint / outpaint / removeObject 所需 */
  supportsMask: boolean;
  /** img2img 降噪强度 */
  supportsStrength: boolean;
  supportsTransparentOutput: boolean;
  maxPromptChars: number;
  /** true → submit 返回句柄，executor 走轮询 */
  async: boolean;
  typicalLatencyMs: [number, number];
}

export interface ModelDescriptor {
  /** 全局唯一 modelId，例如 'mock-flash' */
  id: string;
  providerKey: string;
  displayName: Record<string, string>;
  description?: Record<string, string>;
  tier: ModelTier;
  /** 单张基础价（未乘模式倍率） */
  creditCost: number;
  capabilities: ModelCapabilities;
  badge?: Record<string, string>;
  sortOrder: number;
  enabled: boolean;
  isVisible: boolean;
  isDefault: boolean;
}

// ───────────────────────── 请求（mode 判别联合） ─────────────────────────

export interface ReferenceInput {
  role: ReferenceRole;
  assetId: string;
  /** provider 可 fetch 的短时效 URL */
  url: string;
  mimeType: string;
  width: number;
  height: number;
  /** 0..1，多图合成时的混合权重 */
  weight?: number;
  controlType?: ControlType;
}

interface CommonParams {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  batchCount: number;
  /** 十进制字符串（BigInt 安全） */
  seed?: string;
  guidance?: number;
  references?: ReferenceInput[];
}

export interface TextToImageParams extends CommonParams {
  mode: 'textToImage';
}

export interface ImageToImageParams extends CommonParams {
  mode: 'imageToImage';
  initImage: ReferenceInput;
  strength: number;
}

export interface InpaintParams extends CommonParams {
  mode: 'inpaint';
  initImage: ReferenceInput;
  mask: ReferenceInput;
}

export interface OutpaintParams extends CommonParams {
  mode: 'outpaint';
  initImage: ReferenceInput;
  /** 源图坐标系下的像素扩展量 */
  expand: { top: number; right: number; bottom: number; left: number };
}

export interface RemoveBackgroundParams extends CommonParams {
  mode: 'removeBackground';
  initImage: ReferenceInput;
  returnAlpha: boolean;
}

export interface UpscaleParams extends CommonParams {
  mode: 'upscale';
  initImage: ReferenceInput;
  factor: 2 | 4;
  faceEnhance?: boolean;
}

export interface StyleTransferParams extends CommonParams {
  mode: 'styleTransfer';
  initImage: ReferenceInput;
  styleImage: ReferenceInput;
  styleStrength: number;
}

export interface RemoveObjectParams extends CommonParams {
  mode: 'removeObject';
  initImage: ReferenceInput;
  mask: ReferenceInput;
}

export type GenerateRequest =
  | TextToImageParams
  | ImageToImageParams
  | InpaintParams
  | OutpaintParams
  | RemoveBackgroundParams
  | UpscaleParams
  | StyleTransferParams
  | RemoveObjectParams;

/** 需要 initImage 的模式 */
export const IMAGE_INPUT_MODES: GenerationMode[] = [
  'imageToImage',
  'inpaint',
  'outpaint',
  'removeBackground',
  'upscale',
  'styleTransfer',
  'removeObject',
];

export interface GeneratedImage {
  index: number;
  data: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  seed?: string;
  revisedPrompt?: string;
  nsfw?: boolean;
}

// ───────────────────────── 小工具 ─────────────────────────

export function isImageInputMode(mode: GenerationMode): boolean {
  return IMAGE_INPUT_MODES.includes(mode);
}

/** 不支持的模式直接拒绝 */
export function modeSupported(
  c: ModelCapabilities,
  mode: GenerationMode,
): boolean {
  return c.modes[mode] === true;
}

/**
 * 用户在下拉框里能选的批量上限 —— 注意它**不等于** capabilities.maxBatch。
 *
 * maxBatch 的语义是「单次请求最多出几张」，属于管道内部细节：
 * 同步 provider 由 executor 切块串行提交（见 executor.ts 的分块循环），
 * maxBatch:1 的厂商照样能跑 8 张，所以用户上限就是全局的 8。
 *
 * 只有异步 provider 例外 —— 它的句柄是单个 jobId，executor 无法分块，
 * 这时 maxBatch 才真的是用户上限。
 *
 * 曾经这里直接写 Math.min(8, cap.maxBatch)，把百炼（maxBatch:1）的批量选择器
 * 锁成了只剩一个「1」：后端一直支持批量，前端却单方面禁掉了。
 */
export function userBatchLimit(c: ModelCapabilities): number {
  return c.async ? Math.min(8, c.maxBatch) : 8;
}

/** 该模型是否靠串行补张数（单次只能出 1 张，选多了要等好几轮） */
export function isSerialBatch(c: ModelCapabilities): boolean {
  return !c.async && c.maxBatch < 8;
}
