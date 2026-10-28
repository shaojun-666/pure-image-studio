import {
  ASPECT_RATIOS,
  GENERATION_MODES,
  type AspectRatio,
  type GenerateRequest,
  type GeneratedImage,
  type GenerationMode,
  type ModelCapabilities,
  type ModelDescriptor,
  type ReferenceRole,
  type Resolution,
} from '@/lib/ai/contracts';
import { resolveDimensions } from '@/lib/ai/aspect';
import { env } from '../env';
import { ProviderError } from './errors';
import type { ImageProvider, ProviderContext, SubmitResult } from './types';

/**
 * 火山引擎方舟（Ark）图片生成 provider。
 *
 * ★ 这个文件就是「接入新厂商」的全部成本：模型描述、能力开关、HTTP 调用都在这里，
 *   除 providers/index.ts 加一行外，别处一句不改。
 *
 * ★ 2026-09-21 已对着真实 API 跑通（此前是照公开文档写的）。核对结论：
 *   模型 id —— 照控制台上实际开通的四个型号写，见 VENDOR；
 *   size 档位 —— 文档里的预设档只认小写 '2k'/'3k'/'4k'，而且**出的是方框**，
 *               用户在界面上选的画幅会整个失效，所以改发显式 '宽x高'（见 sizeOf）；
 *   错误码 —— 只验过参数类 400（分类正确）；401/429/5xx 按状态码走，未逐条构造复现。
 *   仍未核对 —— 4K 档（未声明，用户选不到）、seed 是否真被采纳（发了不报错，但没比对过同 seed 的结果）。
 */

const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

/**
 * 内部 id → 厂商模型 id + 该型号的总像素下限。
 *
 * ★ 厂商发版会换模型串，只改这里。
 * ★ minPixels 是**实测**出来的（发一个必然过小的尺寸，方舟回 400 并直接报出下限，
 *   这种探测不扣图不花钱）。低于它方舟一律 400，所以 sizeOf 会等比放大到它之上。
 *   两个值不是随手取的：921600 = 1280×720，3686400 = 2560×1440。
 */
const VENDOR: Record<string, { model: string; minPixels: number }> = {
  'seedream-4': { model: 'doubao-seedream-4-0-20260415', minPixels: 921_600 },
  'seedream-4-5': { model: 'doubao-seedream-4-5-251128', minPixels: 3_686_400 },
  'seedream-5': { model: 'doubao-seedream-5-0-260128', minPixels: 3_686_400 },
  'seedream-5-pro': { model: 'doubao-seedream-5-0-pro-260628', minPixels: 921_600 },
};

const modesOn = (on: GenerationMode[]) =>
  Object.fromEntries(GENERATION_MODES.map((m) => [m, on.includes(m)])) as Record<
    GenerationMode,
    boolean
  >;

/**
 * 方舟一次请求只出一张独立图 —— N>1 走的是 `sequential_image_generation`
 * （一组连贯的组图），语义与「同一提示词的 4 个独立变体」不同。
 * 因此 maxBatch = 1，批量交给 executor 切块串行补，那是它 already 支持的路径。
 *
 * 不声明 4K：4K 档没实测过，长边 4096 的总像素也远超实测过的范围。
 * 这里写的 referenceRoles / supportedResolutions 只是**默认值**，
 * 每个型号的最终取值由 capsFor() 按实测结果算。
 */
const CAPABILITIES: ModelCapabilities = {
  modes: modesOn(['textToImage', 'imageToImage']),
  maxBatch: 1,
  maxReferenceImages: 3,
  referenceRoles: ['reference', 'init'],
  controlTypes: [],
  supportedAspectRatios: [...ASPECT_RATIOS],
  supportedResolutions: ['1K', '2K'],
  supportsNegativePrompt: false, // 方舟没有 negative_prompt 字段
  supportsSeed: true,
  supportsGuidance: true,
  supportsMask: false,
  supportsStrength: false,
  supportsTransparentOutput: false,
  maxPromptChars: 3000,
  async: false,
  typicalLatencyMs: [5000, 25_000],
};

/**
 * 实测「厂商确实读了那张角色参考图、并且把角色的长相带到了新图里」的模型。
 *
 * ★ 2026-09-21 实测：**四个型号全部通过。**
 *   判据与百炼那次同源（见 dashscope.ts 的 SUBJECT_VERIFIED）：参考图选一个
 *   **无法从提示词里猜出长相**的形象。这里用的是一张真实人像照
 *   （本项目 styles/film-portrait.webp，浅棕长卷发、有雀斑的女性），
 *   提示词只说「保持图1中人物的脸部特征和发型，画这个人在咖啡馆里看书」，
 *   **通篇不描述长相**。四个型号各出一张：四张都是参考图里那个人
 *   （雀斑位置、鼻型、眉形对得上），场景换成了咖啡馆。
 *
 * ★ 与百炼那次的差别，说清楚免得后来人误以为证据强度一样：这次**没做对照组**
 *   （不带参考图再出一张）。但同一个提示词 + 同一张参考图，在四个互相独立的
 *   型号上给出同一个人，而提示词里没有任何长相信息 —— 这个一致性只能来自参考图。
 *
 * ★ 顺带在同一轮实测里验到的三件事（不都是这一次调用）：
 *   - 方舟能直接抓我们生产的图片 URL，不必转 base64
 *     （百炼那条链路要提防 301，见 dashscope.ts；这边没这个问题）；
 *   - **单张**参考图不需要在提示词里写「图1」也生效 —— 也就是 App 现有的
 *     「把形象描述内联进提示词」的形状不用改；
 *   - 两张参考图时「图1/图2」的序号方舟认得。
 *
 * ★ 未实测的模型不进这个集合：assertSupported 会在提交那一步挡下（而不是等厂商静默忽略）。
 *   用户引用了形象也不会报错：描述注入那条路照常走，只是不带参考图。
 *   这就是「能力必须实测过才能声明」这条纪律的落点，同 MASK_VERIFIED / OUTPAINT_VERIFIED。
 */
const SUBJECT_VERIFIED = new Set<string>([
  'seedream-4',
  'seedream-4-5',
  'seedream-5',
  'seedream-5-pro',
]);

/**
 * ★ 2026-09-21 实测：方舟的 size 传 '宽x高' 时**各型号的总像素下限不同**，
 *   低于下限直接 400。实测值见 VENDOR 的 minPixels。
 *
 *   后果：4.5 和 5.0 Lite **没有 1K 档**。1K 的任何画幅都低于它们的下限，
 *   硬凑只能等比放大到 1920×1920 —— 那已经不是用户点的那一档了，不如不声明。
 *   （探测办法：发一个必然过小的尺寸，方舟 400 并把下限直接写在错误文案里，不扣图。）
 */
const ONE_K_OK = new Set<string>(['seedream-4', 'seedream-5-pro']);

/** 编辑类模型之外的参考图角色。'subject' 只在实测通过的模型上开 */
const refRoles = (id: string): ReferenceRole[] =>
  SUBJECT_VERIFIED.has(id) ? ['reference', 'init', 'subject'] : ['reference', 'init'];

/** 能力门只在这一处开 —— 别把两个 Set 的成员判断散进各个模型条目里 */
function capsFor(id: string): ModelCapabilities {
  return {
    ...CAPABILITIES,
    referenceRoles: refRoles(id),
    supportedResolutions: ONE_K_OK.has(id) ? ['1K', '2K'] : ['2K'],
  };
}

/** 向上对齐到 8 的倍数。★ 必须**向上**：向下取整会让总像素掉回下限之下，方舟 400 */
const alignUp8 = (n: number): number => Math.max(8, Math.ceil(n / 8) * 8);

/**
 * 「画幅 + 档位」→ 方舟要的 '宽x高'。
 *
 * 为什么不发预设档：预设档出的是**方框**，用户在界面上选的 16:9 / 3:4 会被整个吃掉。
 * 为什么不直接用 resolveDimensions 的结果：各型号有总像素下限（见 VENDOR），低于它 400。
 * 所以画幅照旧、等比放大到下限之上 —— 任何情况下都不为了凑像素去改画幅。
 */
function sizeOf(
  aspectRatio: AspectRatio,
  resolution: Resolution,
  minPixels: number,
): { width: number; height: number } {
  const base = resolveDimensions(aspectRatio, resolution);
  if (base.width * base.height >= minPixels) return base;
  const k = Math.sqrt(minPixels / (base.width * base.height));
  return { width: alignUp8(base.width * k), height: alignUp8(base.height * k) };
}

/**
 * ★ creditCost 四个数是**占位值，待校准** —— 按相对档位先填，等拿到方舟控制台的
 *   单价（元/张）再按站内积分梯度折算成实数。
 *   注意像素下限高的型号（4.5 / 5.0 Lite，下限 2560×1440）单张输出像素天然是
 *   4.0 / 5.0-pro（下限 1280×720）的两三倍，方舟又按 output_tokens 计费，
 *   所以定价不能只看「谁更新」。
 */
const MODELS: ModelDescriptor[] = [
  {
    id: 'seedream-4',
    providerKey: 'volcengine',
    displayName: { zh: '豆包 Seedream 4.0', en: 'Doubao Seedream 4.0' },
    description: {
      zh: '中文语义理解强，支持图生图、多图参考与形象参考',
      en: 'Strong Chinese prompt understanding; image-to-image, multi-reference and character reference',
    },
    badge: { zh: '旗舰', en: 'Ultra' },
    tier: 'ULTRA',
    creditCost: 12,
    capabilities: capsFor('seedream-4'),
    sortOrder: 40,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
  {
    id: 'seedream-4-5',
    providerKey: 'volcengine',
    displayName: { zh: '豆包 Seedream 4.5', en: 'Doubao Seedream 4.5' },
    description: {
      zh: '在 4.0 基础上加强人物一致性与画面细节，支持形象参考',
      en: 'Better character consistency and detail than 4.0; supports character reference',
    },
    badge: { zh: '均衡', en: 'Balanced' },
    tier: 'QUALITY',
    creditCost: 15,
    capabilities: capsFor('seedream-4-5'),
    sortOrder: 41,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
  {
    id: 'seedream-5',
    providerKey: 'volcengine',
    displayName: { zh: '豆包 Seedream 5.0', en: 'Doubao Seedream 5.0' },
    description: {
      zh: '新一代模型，中文语义与人物一致性更强，支持形象参考',
      en: 'Newer generation with stronger Chinese semantics and character consistency',
    },
    badge: { zh: '最新', en: 'Latest' },
    tier: 'ULTRA',
    creditCost: 20,
    capabilities: capsFor('seedream-5'),
    sortOrder: 42,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
  {
    id: 'seedream-5-pro',
    providerKey: 'volcengine',
    displayName: { zh: '豆包 Seedream 5.0 Pro', en: 'Doubao Seedream 5.0 Pro' },
    description: {
      zh: '5.0 的专业版，细节、质感与人物一致性最好，支持形象参考',
      en: 'The professional 5.0 — best detail, texture and character consistency',
    },
    badge: { zh: '顶配', en: 'Max' },
    tier: 'ULTRA',
    creditCost: 25,
    capabilities: capsFor('seedream-5-pro'),
    sortOrder: 43,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
];

/**
 * 方舟错误体是 `{ error: { code, message } }`，但网关层出错时会直接吐纯文本，
 * 所以 text 也要兜底。
 */
function mapHttpError(
  status: number,
  parsed: unknown,
  text: string,
): ProviderError {
  const err = (parsed as { error?: { code?: string; message?: string } } | null)
    ?.error;
  const code = String(err?.code ?? '');
  const message =
    err?.message ??
    (text.trim().slice(0, 300) || `方舟返回 HTTP ${status}`);
  const opts = { httpStatus: status, raw: parsed ?? text.slice(0, 1000) };

  if (status === 401 || status === 403) {
    return new ProviderError('auth_failed', message, opts);
  }
  if (status === 429) return new ProviderError('rate_limited', message, opts);
  if (status >= 500) return new ProviderError('upstream_error', message, opts);
  // 内容审核命中：这类重试也没用，必须走立即退款而不是指数退避
  if (/sensitive|filter|risk|policy/i.test(code) || /敏感|审核|违规/.test(message)) {
    return new ProviderError('content_filtered', message, opts);
  }
  return new ProviderError('invalid_request', message, opts);
}

export const volcengineProvider: ImageProvider = {
  key: 'volcengine',
  models: MODELS,

  async submit(
    req: GenerateRequest,
    ctx: ProviderContext,
  ): Promise<SubmitResult> {
    const vendor = VENDOR[ctx.model.id];
    if (!vendor) {
      throw new ProviderError(
        'invalid_request',
        `方舟模型未映射：${ctx.model.id}`,
      );
    }
    if (!env.ARK_API_KEY) {
      throw new ProviderError('auth_failed', '未配置 ARK_API_KEY');
    }

    // 发显式宽高而不是预设档：预设档出方框，会把用户选的画幅整个吃掉（见 sizeOf）
    const { width, height } = sizeOf(
      req.aspectRatio,
      req.resolution,
      vendor.minPixels,
    );

    const body: Record<string, unknown> = {
      model: vendor.model,
      prompt: req.prompt,
      size: `${width}x${height}`,
      // 要 base64 而不是临时 URL：省一次跨网下载，也避开临时 URL 的过期竞态
      response_format: 'b64_json',
      watermark: false,
    };
    if (req.seed) body.seed = Number(req.seed);
    if (req.guidance !== undefined) body.guidance_scale = req.guidance;

    // 参考图直接把签名 URL 交给方舟去取 —— 不下载再编码，省一次往返
    const refs = [
      ...(req.mode === 'imageToImage' ? [req.initImage.url] : []),
      ...(req.references ?? []).map((r) => r.url),
    ];
    if (refs.length === 1) body.image = refs[0];
    else if (refs.length > 1) body.image = refs;

    const res = await fetch(`${BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.ARK_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null; // 网关错误页不是 JSON
    }
    if (!res.ok) throw mapHttpError(res.status, parsed, text);

    const items =
      (parsed as { data?: { b64_json?: string }[] } | null)?.data ?? [];
    if (items.length === 0) {
      throw new ProviderError('upstream_error', '方舟返回了空结果', {
        raw: parsed,
      });
    }

    return {
      kind: 'sync',
      images: items.map(
        (item, i): GeneratedImage => ({
          index: i,
          data: Buffer.from(item.b64_json ?? '', 'base64'),
          mimeType: 'image/png',
          // 0 会让 persist 用 deriveAssets 实测的尺寸兜底，比按画幅猜的准
          width: 0,
          height: 0,
          seed: req.seed,
        }),
      ),
      raw: { model: vendor.model, count: items.length },
    };
  },
};
