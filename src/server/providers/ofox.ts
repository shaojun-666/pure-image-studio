import { resolveDimensions } from '@/lib/ai/aspect';
import {
  ASPECT_RATIOS,
  GENERATION_MODES,
  type AspectRatio,
  type GenerateRequest,
  type GeneratedImage,
  type GenerationMode,
  type ModelCapabilities,
  type ModelDescriptor,
  type ReferenceInput,
  type Resolution,
} from '@/lib/ai/contracts';
import sharp from 'sharp';
import { env } from '../env';
import { ProviderError } from './errors';
import type { ImageProvider, ProviderContext, SubmitResult } from './types';

/**
 * ofox.ai 中转站 provider（OpenAI 兼容 /v1）。
 *
 * ★ 这是第三条厂商路。与另外两条的差异同样都是**对着真实 API 实测出来的**，不是照文档猜的：
 *
 *   1. /v1/images/generations 同步返回 b64_json，不是 OSS 临时 URL ——
 *      所以没有百炼那种「下载一次拿字节」的步骤，SubmitResult 直接 kind: 'sync'。
 *   2. size 不是 OpenAI 那种固定白名单。实测把它当白名单写会翻车：
 *        999x999  → "Width and height must both be divisible by 16."
 *        1024x576 → "Requested resolution is below the current minimum pixel budget."
 *      即：**接受任意尺寸，但宽高都要被 16 整除，且总像素有下限**。
 *   3. quality 默认是 low —— 不显式传就是低画质。合法值 low/medium/high/auto（实测报错原文）。
 *   4. 各模型认的参数不一样，照 supported_parameters 分：Gemini 图像系**只认 prompt/output_format**
 *      （不给 size、不给 n），gpt-image-2 认 size/n/quality，mai 认 size/n。
 *      —— 给不认的模型塞 size 是静默忽略，等于在 UI 上承诺一个做不到的宽高比，所以按模型分流。
 *
 * ★ imageToImage **按模型分别开关**，依据是对着真实 /v1/images/edits 实测的编辑效果
 *   （每一次都看过出图，不是只看 HTTP 200）：
 *
 *     mai-image-flash         中文提示词 → 蓝圈准确变红                    ✅ 开
 *     gemini-3-pro-image      中文 → 确实改了色但自行加了元素；英文 → 干净   ✅ 开
 *     gpt-image-2             英文 → 干净；中文两发（长句、短句）都没执行    ❌ 关
 *     gemini-3.1-flash-image  中文 → 返回一张完全无关的图；英文 → 直接 400  ❌ 关
 *
 *   ★ 门槛定在「**中文**提示词下编辑确实生效」，因为这个站是中文站、用户用中文写提示词。
 *   实测里最容易骗人的是 gpt-image-2 和 gemini-3.1-flash：**都返回过 200 + 一张合法 PNG**，
 *   内容却分别是「原图纹丝不动」和「一张盆栽」。所以判据必须是看过图，不能是看状态码。
 *   想把 gpt-image-2 也开上（它英文效果很好），加进 EDITS_VERIFIED 即可。
 *
 * ★ 「重绘 / 消除」走的是同一个 /v1/images/edits，只多一个 multipart 字段 `mask`。
 *   能不能用取决于**中转站认不认这个字段** —— 被静默忽略的话会退化成整图重绘，
 *   而 UI 上承诺的是「只改涂抹区域」。所以和 EDITS_VERIFIED 一样按模型实测开关（见 MASK_VERIFIED）。
 *   另有一处约定差异必须转换：画布导出的是灰度图（白=改），OpenAI 要的是 alpha（透明=改），
 *   蒙版和原图的尺寸还得逐像素一致，见 maskToAlphaPng。
 *   ★ 已实测：**这个中继不转发 mask**，所以重绘/消除对用户是不可用的，见 MASK_VERIFIED。
 */

const ENDPOINT = 'https://api.ofox.ai/v1/images/generations';
/**
 * 图生图走这个端点：multipart，字段名 `image`。
 * 实测不带图时的报错原文是 "at least one image or image_url is required"，
 * 说明它同时收 multipart 文件与 image_url 两种形态，这里用文件那种（不依赖外网可达）。
 */
const EDIT_ENDPOINT = 'https://api.ofox.ai/v1/images/edits';

/** ofox 要求宽高都能被 16 整除。注意 aspect.ts 的 align8 是 8 的倍数，**不满足这条** */
const ALIGN = 16;
/** 实测 1024×576（589,824）被拒、1024² 通过。取 1024² 作安全下限 */
const MIN_PIXELS = 1024 * 1024;
/** 只有 1K 是实测过的档；2K 会不会撞上未知的最大像素预算没验，所以不对外声明 */
const VERIFIED_RESOLUTIONS: Resolution[] = ['1K'];

/** 内部 id → ofox 模型 id。★ 厂商改版换这个串，只改这里 */
const VENDOR_MODEL: Record<string, string> = {
  'nano-banana-pro': 'google/gemini-3-pro-image',
  'nano-banana-2': 'google/gemini-3.1-flash-image',
  'gpt-image-2': 'openai/gpt-image-2',
  'mai-image-flash': 'microsoft/mai-image-2.5-flash',
};

/**
 * 哪些内部 id 在 ofox 侧真的认 size / quality。
 * 依据是 /v1/models 每个条目的 supported_parameters，不是照 OpenAI 文档假设的 ——
 * gemini-3-pro-image 的 supported_parameters 里**没有** size。
 */
const SUPPORTS_SIZE = new Set(['gpt-image-2', 'mai-image-flash']);
const SUPPORTS_QUALITY = new Set(['gpt-image-2']);

/**
 * 实测「编辑确实生效」的模型才开图生图，依据见文件头。
 * gpt-image-2 是用户看过中英文对比后拍板开的：英文干净，中文不稳（0/2）。面向中文用户时会有落差。
 */
const EDITS_VERIFIED = new Set(['mai-image-flash', 'nano-banana-pro', 'gpt-image-2']);

/**
 * 实测「multipart 里的 mask 确实被转发、且只改涂抹区域」的模型。
 * 与 EDITS_VERIFIED 分开是因为这是两件事：图生图能编辑 ≠ 蒙版能透传。
 *
 * ★ 2026-09-21 实测：**中转站把 mask 吞了，一个都不能开。**（所以这里是空集）
 *   判据是二值的：1024² 纯灰底图 + 左上角 320² 白色方块蒙版 + 提示词「填满蓝黄棋盘格」。
 *   蒙版生效 → 棋盘格只出现在方块里（蒙版外像素差≈0，蒙版内≈93）；
 *   实际结果 → 棋盘格铺满全图，**蒙版外 93.10 / 蒙版内 93.01**，即整图重绘。
 *   它是静默的：HTTP 200、合法 PNG、不报错、不警告 —— 靠看返回码永远发现不了，
 *   只会让用户涂了半天却被整张重画，而 credit 照扣。这正是 EDITS_VERIFIED 那条纪律的来由。
 *
 *   底下的 maskToAlphaPng 和 form 里的 mask 字段**留着**：这不是死代码，
 *   是一个关掉的开关 —— 换一家真转发 mask 的中继、或换模型后重测通过，往这个集合里加 id 即可。
 *   （项目没有 git，删掉就得重写。）
 */
const MASK_VERIFIED = new Set<string>([]);

/**
 * 实测「本地把画布撑开 + 交给编辑接口补」能出可用扩图结果的模型。
 *
 * ★ 上游四家都没有扩图 API，所以这条路是**本地预处理 + 提示词**凑出来的：
 *   先把原图 pad 到目标尺寸、新增区域用模糊放大的原图铺底，再让模型把糊的地方画清楚。
 *   因此质量天然不如原生扩图，且必须看过图才能开 —— 和另外两个集合同一个纪律。
 *
 * ★ 2026-09-21 实测通过：1024² 彩铅插画 → 左右各扩 256px 到 1536×1024，
 *   出来的两侧森林是自然延展的，树、落叶、光线、笔触都对得上，主体原样保留。
 *   一个已知偏差：模型会把整张图重画一遍（中继本来就整图重绘，见 MASK_VERIFIED），
 *   所以原图那部分像素不保证逐位保真 —— 扩图场景可以接受，但别拿它当「无损加边」用。
 */
const OUTPAINT_VERIFIED = new Set(['gpt-image-2']);

/** 走 /v1/images/edits 的模式。文生图之外都归这里 */
const EDIT_MODES = new Set<GenerationMode>([
  'imageToImage',
  'inpaint',
  'removeObject',
  'outpaint',
]);

/** gpt-image-2 的 quality 默认 low，不传就是低画质；medium 是画质/成本的折中 */
const QUALITY = 'medium';

const modesOn = (on: GenerationMode[]) =>
  Object.fromEntries(GENERATION_MODES.map((m) => [m, on.includes(m)])) as Record<
    GenerationMode,
    boolean
  >;

/**
 * 中转站这层没有能力差异，四个模型的开关是同一套；
 * 差别只在 supportedAspectRatios（见下）与 creditCost / tier。
 */
const CAPABILITIES: ModelCapabilities = {
  modes: modesOn(['textToImage']),
  maxBatch: 1,
  maxReferenceImages: 0,
  referenceRoles: [],
  controlTypes: [],
  supportedAspectRatios: [...ASPECT_RATIOS],
  supportedResolutions: VERIFIED_RESOLUTIONS,
  supportsNegativePrompt: false,
  // supported_parameters 里四个模型都没有 seed，不对外声明
  supportsSeed: false,
  supportsGuidance: false,
  supportsMask: false,
  supportsStrength: false,
  supportsTransparentOutput: false,
  maxPromptChars: 2000,
  async: false,
  typicalLatencyMs: [8000, 35_000],
};

/**
 * Gemini 图像系不给 size 参数，宽高比控制不了。
 * 只声明 1:1 是**刻意保守**：让 UI 把其余比例置灰，而不是让用户选了 21:9 却拿到一张方图。
 * —— 和 dashscope 那边「negative_prompt 被静默忽略就不声明 supportsNegativePrompt」同一条纪律。
 */
const NO_SIZE_CAPS: ModelCapabilities = {
  ...CAPABILITIES,
  supportedAspectRatios: ['1:1'],
};

/**
 * 每个模型的能力 = 中转站这层的公共能力 + 两处按模型分流：认不认 size、开不开图生图。
 *
 * ★ `maxReferenceImages` 在这个代码库里不是「参考图张数」那么单纯：
 *   registry.ts 拿 `maxReferenceImages === 0` 当「不支持以图生图」的闸门
 *   （见 assertSupported 里的 hasInitImage 分支），所以开图生图必须把它抬到 ≥1。
 *   referenceRoles 只留 'init'，别的角色一律被拒 —— 这条路的输入图就只有那张原图。
 */
function capsFor(id: string): ModelCapabilities {
  const base = SUPPORTS_SIZE.has(id) ? CAPABILITIES : NO_SIZE_CAPS;
  if (!EDITS_VERIFIED.has(id)) return base;

  const modes: GenerationMode[] = ['textToImage', 'imageToImage'];
  if (MASK_VERIFIED.has(id)) modes.push('inpaint', 'removeObject');
  if (OUTPAINT_VERIFIED.has(id)) modes.push('outpaint');

  return {
    ...base,
    modes: modesOn(modes),
    maxReferenceImages: 1,
    referenceRoles: ['init'],
    supportsMask: MASK_VERIFIED.has(id),
  };
}

const MODELS: ModelDescriptor[] = [
  {
    id: 'nano-banana-pro',
    providerKey: 'ofox',
    displayName: { zh: 'Nano Banana Pro', en: 'Nano Banana Pro' },
    description: {
      zh: '谷歌当前最强的图像模型，编辑能力口碑最好',
      en: "Google's strongest image model, best-in-class editing",
    },
    badge: { zh: '最热', en: 'Hottest' },
    tier: 'ULTRA',
    creditCost: 20,
    capabilities: capsFor('nano-banana-pro'),
    sortOrder: 60,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
  {
    id: 'gpt-image-2',
    providerKey: 'ofox',
    displayName: { zh: 'GPT Image 2', en: 'GPT Image 2' },
    description: { zh: 'OpenAI 图像系，指令遵循稳，可调画质', en: 'OpenAI image line, reliable instruction following' },
    badge: { zh: '旗舰', en: 'Ultra' },
    tier: 'QUALITY',
    creditCost: 15,
    capabilities: capsFor('gpt-image-2'),
    sortOrder: 61,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
  {
    id: 'nano-banana-2',
    providerKey: 'ofox',
    displayName: { zh: 'Nano Banana 2', en: 'Nano Banana 2' },
    description: { zh: 'Nano Banana 的快速版，便宜、适合反复试', en: 'Fast Nano Banana, cheap for iteration' },
    badge: { zh: '极速', en: 'Fast' },
    tier: 'FAST',
    creditCost: 8,
    capabilities: capsFor('nano-banana-2'),
    sortOrder: 62,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
  {
    id: 'mai-image-flash',
    providerKey: 'ofox',
    displayName: { zh: 'MAI Image 2.5 Flash', en: 'MAI Image 2.5 Flash' },
    description: { zh: '微软图像系轻量版，最便宜的一家', en: 'Microsoft image line, lightest and cheapest' },
    badge: { zh: '便宜', en: 'Cheap' },
    tier: 'FAST',
    creditCost: 6,
    capabilities: capsFor('mai-image-flash'),
    sortOrder: 63,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
];

function alignUp(n: number, step = ALIGN): number {
  return Math.max(step, Math.ceil(n / step) * step);
}

/**
 * ofox 的尺寸要同时满足三件事：比例对、宽高都被 16 整除、总像素 >= 1024²。
 *
 * ★ 不能直接复用 resolveDimensions()：它按 align8 走，1K 档下 21:9 → 440、3:2 → 680，
 *   都除不尽 16，会被 ofox 当场打回。这里拿它的输出当**比例来源**，再往上重对齐并放大。
 *   （1:1 算出来正好是 1024×1024 —— 与实测通过的那一张一致。）
 *
 * 已知取舍：两维各自向 16 取整，比例会有最多约 2.5% 的漂移
 * （实测 8 档：4:3→1.321、16:9→1.755、21:9→2.279，而非 1.333 / 1.778 / 2.333）。
 * 想要精确比例得在 16 的格点上做一次搜索，为这 2% 加一段循环不划算，故保留简单写法。
 */
function sizeOf(
  aspectRatio: AspectRatio,
  resolution: Resolution,
): { width: number; height: number } {
  const base = resolveDimensions(aspectRatio, resolution);
  const ratio = base.width / base.height;

  let width = alignUp(Math.max(base.width, Math.sqrt(MIN_PIXELS * ratio)));
  let height = alignUp(Math.round(width / ratio));
  // 对齐会让像素数轻微下滑（16:9 那种比例尤甚），必要时再放大一格。
  // 每轮 width 至少 +16，h 随之增长，所以必然收敛；上限只是防御性写法。
  while (width * height < MIN_PIXELS && width < 8192) {
    width += ALIGN;
    height = alignUp(Math.round(width / ratio));
  }
  return { width, height };
}

/** ofox 的错误体是 OpenAI 那层 { error: { message, type, code } } */
type OfoxErrorBody = { error?: { message?: string; type?: string; code?: string | null } };

function mapHttpError(status: number, body: OfoxErrorBody | null, raw: string): ProviderError {
  const message = body?.error?.message ?? raw.slice(0, 300);
  const opts = { httpStatus: status, raw: body };
  if (status === 401 || status === 403) return new ProviderError('auth_failed', message, opts);
  if (status === 404) return new ProviderError('not_found', message, opts);
  if (status === 429) return new ProviderError('rate_limited', message, opts);
  if (status >= 500) return new ProviderError('upstream_error', message, opts);
  // 内容审核命中：重试没用，必须走立即退款而不是指数退避
  if (/content|policy|moderation|safety|sensitive|违规|审核/i.test(message)) {
    return new ProviderError('content_filtered', message, opts);
  }
  return new ProviderError('invalid_request', message, opts);
}

type OfoxBody = {
  data?: { b64_json?: string; url?: string; index?: number; revised_prompt?: string }[];
  output_format?: string;
  size?: string;
};

const MIME_BY_FORMAT: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export const ofoxProvider: ImageProvider = {
  key: 'ofox',
  models: MODELS,

  async submit(req: GenerateRequest, ctx: ProviderContext): Promise<SubmitResult> {
    const vendorModel = VENDOR_MODEL[ctx.model.id];
    if (!vendorModel) {
      throw new ProviderError('invalid_request', `ofox 模型未映射：${ctx.model.id}`);
    }
    if (!env.OFOX_API_KEY) {
      throw new ProviderError('auth_failed', '未配置 OFOX_API_KEY');
    }
    // 只声明了这几种模式；真收到别的说明门控被绕过了，宁可明确报错
    if (req.mode !== 'textToImage' && !EDIT_MODES.has(req.mode)) {
      throw new ProviderError(
        'invalid_request',
        `ofox 这条路只支持文生图 / 图生图 / 重绘 / 消除 / 扩图，收到 ${req.mode}`,
      );
    }

    const auth = { authorization: `Bearer ${env.OFOX_API_KEY}` };
    let res: Response;

    if (req.mode === 'textToImage') {
      const body: Record<string, unknown> = { model: vendorModel, prompt: req.prompt, n: 1 };
      if (SUPPORTS_SIZE.has(ctx.model.id)) {
        const { width, height } = sizeOf(req.aspectRatio, req.resolution);
        body.size = `${width}x${height}`;
      }
      if (SUPPORTS_QUALITY.has(ctx.model.id)) {
        body.quality = QUALITY;
      }

      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctx.signal,
      });
    } else {
      /**
       * ★ 扩图没有上游 API，只能先把画布撑开成一张**真图**再交给编辑接口（见 padForOutpaint）。
       *   其余模式直接用原图字节。
       *   注意尺寸要跟着走：扩图必须按 pad 之后的宽高要，按原图比例要等于让上游把
       *   我们刚撑开的画布又裁回去。
       */
      let imageBytes: Buffer;
      let size: { width: number; height: number };
      let mimeType: string;
      if (req.mode === 'outpaint') {
        const padded = await padForOutpaint(req.initImage, req.expand, ctx.signal);
        imageBytes = padded.data;
        size = { width: padded.width, height: padded.height };
        mimeType = 'image/png';
      } else {
        imageBytes = await fetchImageBytes(req.initImage.url, ctx.signal);
        size = sizeOf(req.aspectRatio, req.resolution);
        mimeType = req.initImage.mimeType;
      }

      // ★ multipart 不能自己设 content-type —— 得让 fetch 自己连 boundary 一起生成
      const form = new FormData();
      form.append('model', vendorModel);
      form.append('prompt', req.prompt);
      if (SUPPORTS_SIZE.has(ctx.model.id)) {
        form.append('size', `${size.width}x${size.height}`);
      }
      if (SUPPORTS_QUALITY.has(ctx.model.id)) {
        form.append('quality', QUALITY);
      }
      form.append(
        'image',
        // 再包一层 Uint8Array：Buffer 的底层是 ArrayBufferLike，TS 不认它是 BlobPart
        new Blob([new Uint8Array(imageBytes)], { type: mimeType }),
        'input.png',
      );

      // 蒙版类模式多带一个 mask 字段；转换规则见 maskToAlphaPng
      if (req.mode === 'inpaint' || req.mode === 'removeObject') {
        const maskPng = await maskToAlphaPng(req.mask.url, imageBytes, ctx.signal);
        form.append(
          'mask',
          new Blob([new Uint8Array(maskPng)], { type: 'image/png' }),
          'mask.png',
        );
      }

      res = await fetch(EDIT_ENDPOINT, {
        method: 'POST',
        headers: auth,
        body: form,
        signal: ctx.signal,
      });
    }

    const text = await res.text();
    let parsed: OfoxBody | null = null;
    try {
      parsed = JSON.parse(text) as OfoxBody;
    } catch {
      parsed = null; // 网关错误页不是 JSON
    }

    if (!res.ok) {
      throw mapHttpError(res.status, parsed as OfoxErrorBody | null, text);
    }

    const items = parsed?.data ?? [];
    if (items.length === 0) {
      throw new ProviderError('upstream_error', 'ofox 返回了空结果', { raw: parsed });
    }

    const declaredMime = MIME_BY_FORMAT[parsed?.output_format ?? 'png'] ?? 'image/png';

    const images: GeneratedImage[] = [];
    for (const [i, item] of items.entries()) {
      // 同步端点给的是 base64；url 形态留一条退路，但**未实测**（见文件头说明）
      const bytes = item.b64_json
        ? Buffer.from(item.b64_json, 'base64')
        : item.url
          ? await downloadImage(item.url, ctx.signal)
          : null;
      if (!bytes) {
        throw new ProviderError('upstream_error', 'ofox 返回的条目既没有 b64_json 也没有 url', {
          raw: item,
        });
      }

      /**
       * 真实宽高从字节里读，而不是回填请求值 ——
       * 一来 Gemini 那两个模型根本收不到 size，回填等于撒谎；
       * 二来顺带验证这确实是一张能解码的图（防中转站 200 返回一张错误页）。
       */
      let width: number;
      let height: number;
      let mimeType = declaredMime;
      try {
        const meta = await sharp(bytes).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
        if (meta.format) mimeType = MIME_BY_FORMAT[meta.format] ?? declaredMime;
      } catch (e) {
        throw new ProviderError('upstream_error', 'ofox 返回的字节不是可解码的图片', {
          raw: { index: i, error: e instanceof Error ? e.message : String(e) },
        });
      }
      if (!width || !height) {
        throw new ProviderError('upstream_error', '读不出出图尺寸', { raw: { index: i } });
      }

      images.push({
        index: item.index ?? i,
        data: new Uint8Array(bytes),
        mimeType,
        width,
        height,
        revisedPrompt: item.revised_prompt,
      });
    }

    return { kind: 'sync', images, raw: { model: vendorModel, size: parsed?.size } };
  },
};

async function downloadImage(url: string, signal: AbortSignal): Promise<Buffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new ProviderError('upstream_error', `下载 ofox 出图失败 HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** 取输入图字节（原图 / 蒙版都用它）。地址由 executor 的 toRef 统一绝对化，这里直接用 */
async function fetchImageBytes(url: string, signal: AbortSignal): Promise<Buffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new ProviderError('upstream_error', `取输入图失败 HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 灰度蒙版 → OpenAI 约定的 alpha 蒙版（PNG）。
 *
 * ★ 两边约定是**反的**，不转就是灾难：
 *     画布导出：灰度图，**白 = 要改**、黑 = 保留（mask-canvas.tsx:20）
 *     OpenAI  ：**透明 = 要改**、不透明 = 保留
 *   直接把灰度图当 mask 发过去，等于告诉上游「整张图都重画」——
 *   返回 200 和一张合法 PNG，内容却是原图重绘，正是最容易被状态码骗过去的那种失败。
 *
 * 尺寸还必须和原图**逐像素一致**，否则 OpenAI 直接拒；所以按原图**真实**宽高重采样，
 * 而不是信数据库里存的 width/height（那个是展示用的，不保证等于像素尺寸）。
 */
async function maskToAlphaPng(
  maskUrl: string,
  imageBytes: Buffer,
  signal: AbortSignal,
): Promise<Buffer> {
  const meta = await sharp(imageBytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new ProviderError('invalid_request', '读不出原图尺寸，蒙版无法对齐');
  }

  const { data } = await sharp(await fetchImageBytes(maskUrl, signal))
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // RGB 通道留 0 即可：mask 只有 alpha 参与判定
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4 + 3] = 255 - data[i]; // 白(要改) → alpha 0(透明)
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * 扩图的本地预处理：把画布撑开成一张真图。
 *
 * ★ 上游四家都没有扩图 API，所以只能「先 pad 再让编辑接口补」。
 *   新增区域**不能留白或留黑** —— 那样模型多半会把空白当成待画的新画布，
 *   沿边补出一圈突兀的色块。这里用原图放大后重度模糊铺底，
 *   把任务从「凭空画」变成「把糊的地方画清楚」，这也是各家扩图功能的通行做法。
 *
 * 目标宽高在这里就对齐到 16 —— ofox 的硬要求，且这样返回的 width/height 可以直接当
 * `size` 发出去，不必再各自向上取整（那会让比例漂移）。
 */
async function padForOutpaint(
  init: ReferenceInput,
  expand: { top: number; right: number; bottom: number; left: number },
  signal: AbortSignal,
): Promise<{ data: Buffer; width: number; height: number }> {
  const src = await fetchImageBytes(init.url, signal);
  const meta = await sharp(src).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) {
    throw new ProviderError('invalid_request', '读不出原图尺寸，无法扩图');
  }

  const width = alignUp(w + expand.left + expand.right);
  const height = alignUp(h + expand.top + expand.bottom);

  const backdrop = await sharp(src)
    .resize(width, height, { fit: 'cover' })
    .blur(Math.max(8, Math.round(Math.min(width, height) / 40)))
    .toBuffer();

  const data = await sharp(backdrop)
    .composite([{ input: src, left: expand.left, top: expand.top }])
    .png()
    .toBuffer();

  return { data, width, height };
}
