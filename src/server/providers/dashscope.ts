import { resolveDimensions } from '@/lib/ai/aspect';
import {
  ASPECT_RATIOS,
  GENERATION_MODES,
  type GenerateRequest,
  type GeneratedImage,
  type GenerationMode,
  type ModelCapabilities,
  type ModelDescriptor,
  type ReferenceRole,
} from '@/lib/ai/contracts';
import { env } from '../env';
import { ProviderError } from './errors';
import type { ImageProvider, ProviderContext, SubmitResult } from './types';

/**
 * 阿里云百炼（DashScope）图像生成 provider。
 *
 * ★ 这个文件就是「接入新厂商」的全部成本：模型描述、能力开关、HTTP 调用都在这里，
 *   除 providers/index.ts 加一行外，别处一行不改。
 *
 * 与火山方舟那条路的差异都是**对着真实 API 实测出来的**，不是照文档猜的：
 *   1. 走 multimodal-generation 端点，同步返回，没有 task_id 轮询这一步
 *   2. 返回的是 OSS 临时 URL 而不是 base64，所以要自己下载一次拿字节
 *   3. size 是 "宽*高"（星号分隔），且**接受任意值** —— 只要求总像素落在
 *      [512², 2048²]，因此可以直接复用 resolveDimensions()，不需要尺寸映射表
 *   4. 错误体是 { code, message }，没有方舟那层 { error: {...} } 外壳
 */

const ENDPOINT =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

/** 实测报错原文：Image area must be between 262144 (512x512) and 4194304 (2048x2048) */
const MIN_AREA = 512 * 512;
const MAX_AREA = 2048 * 2048;

/** 内部 id → 百炼模型 id。★ 厂商发版会换这个串，只改这里 */
const VENDOR_MODEL: Record<string, string> = {
  'z-image-turbo': 'z-image-turbo',
  'qwen-image-3': 'qwen-image-3.0',
  'qwen-image-3-pro': 'qwen-image-3.0-pro',
  'qwen-image-edit': 'qwen-image-edit-max',
};

const modesOn = (on: GenerationMode[]) =>
  Object.fromEntries(GENERATION_MODES.map((m) => [m, on.includes(m)])) as Record<
    GenerationMode,
    boolean
  >;

/**
 * 实测「厂商确实读了那张角色参考图、并且把角色的长相带到了新图里」的模型。
 *
 * 判据是二值的，而且要带对照组，否则分不清「读懂了参考图」和「碰巧画得像」：
 *   参考图选一个**无法从提示词里猜出来**的形象，提示词只说要对它做什么、不描述长相；
 *   同一张参考图配两个差异极大的场景（雪地 / 沙漠日落），各出一张。
 *   通过 = 两张都是参考图里那个特定角色；失败 = 形象漂移 / 被忽略 / 只迁了色调。
 *   对照组 = 同样提示词但不带参考图 —— 若对照组也能出一样的角色，说明根本没读第二张图。
 *
 * 2026-09-21 实测通过，证据留档：底图纯灰占位、参考图一张山魈（蓝色脊状脸颊 + 红鼻梁 +
 * 橙眼，无法从提示词猜出来）、提示词完全不描述长相，只换场景（雪地 / 沙漠日落）各出一张。
 * 两张都是那只山魈（身份特征一致、只换背景）；对照组不带参考图，两次各编了一个不同的
 * 拟人战士（深蓝角盔 / 兜帽披风），与山魈毫无关系 —— 差异只能来自第二张图。
 * 顺带确认第二张图没被中继吞掉（ofox 中继吞 mask 那个问题不适用于这里）。
 * 代价 ¥2（4 次成功调用 × ¥0.5）。
 *
 * ★ 后来人注意：百炼的图片抓取器**不跟随重定向**。
 *   把参考图放在会 301 的地址上（实测 cdn.jsdelivr.net/gh/... 就是 301），
 *   换来的是一句 `InvalidParameter.DataInspection: Unable to download the media resource` ——
 *   文案看着像内容审核，其实是重定向。判定方法：不带 `-L` 打一次
 *   `curl -s -o /dev/null -w "%{http_code}" <url>`，必须是 200。
 *   我们自己这条链路是安全的：local 驱动走 /api/files/[...key]，直出 200 不重定向；
 *   oss 驱动走 signatureUrl，也是直连。换成第三个驱动时要重新确认这一点。
 *
 * ★ 未实测的模型仍然不进这个集合：assertSupported 会在提交那一步挡下（而不是等厂商静默忽略）。
 *   用户引用了形象也不会报错：描述注入那条路照常走，只是不带参考图。
 *   这就是「能力必须实测过才能声明」这条纪律的落点，同 MASK_VERIFIED / OUTPAINT_VERIFIED。
 */
const SUBJECT_VERIFIED = new Set<string>(['qwen-image-edit']);

/** 编辑类模型的参考图角色。'subject' 只在实测通过的模型上开 */
const editRefRoles = (id: string): ReferenceRole[] =>
  SUBJECT_VERIFIED.has(id)
    ? ['init', 'style', 'subject']
    : ['init', 'style'];

/**
 * maxBatch = 1：一次请求只出一张。批量交给 executor 切块串行补，那是它已支持的路径，
 * 比赌厂商的 n 参数行为要稳。4K 不在 supportedResolutions 里 —— 4096² 是这里上限的 16 倍。
 */
const TEXT_CAPS: ModelCapabilities = {
  modes: modesOn(['textToImage']),
  maxBatch: 1,
  maxReferenceImages: 0,
  referenceRoles: [],
  controlTypes: [],
  supportedAspectRatios: [...ASPECT_RATIOS],
  supportedResolutions: ['1K', '2K'],
  supportsNegativePrompt: false,
  supportsSeed: true,
  supportsGuidance: false,
  supportsMask: false,
  supportsStrength: false,
  supportsTransparentOutput: false,
  maxPromptChars: 2000,
  async: false,
  typicalLatencyMs: [8000, 30_000],
};

const MODELS: ModelDescriptor[] = [
  {
    id: 'z-image-turbo',
    providerKey: 'dashscope',
    displayName: { zh: 'Z-Image-Turbo', en: 'Z-Image-Turbo' },
    description: { zh: '出图最快，适合草稿和批量试色', en: 'Fastest, good for drafts and batch exploration' },
    badge: { zh: '极速', en: 'Fast' },
    tier: 'FAST',
    creditCost: 3,
    capabilities: { ...TEXT_CAPS, typicalLatencyMs: [3000, 12_000] },
    sortOrder: 10,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
  {
    id: 'qwen-image-3',
    providerKey: 'dashscope',
    displayName: { zh: 'Qwen-Image 3.0', en: 'Qwen-Image 3.0' },
    description: { zh: '中文语义理解强，文字渲染准', en: 'Strong Chinese semantics, accurate text rendering' },
    badge: { zh: '高质量', en: 'Quality' },
    tier: 'QUALITY',
    creditCost: 10,
    capabilities: TEXT_CAPS,
    sortOrder: 11,
    enabled: true,
    isVisible: true,
    isDefault: true,
  },
  {
    id: 'qwen-image-3-pro',
    providerKey: 'dashscope',
    displayName: { zh: 'Qwen-Image 3.0 Pro', en: 'Qwen-Image 3.0 Pro' },
    description: { zh: '细节与光影最好，出图慢一些', en: 'Best detail and lighting, slower' },
    badge: { zh: '旗舰', en: 'Ultra' },
    tier: 'ULTRA',
    creditCost: 20,
    capabilities: { ...TEXT_CAPS, typicalLatencyMs: [15_000, 60_000] },
    sortOrder: 12,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
  {
    id: 'qwen-image-edit',
    providerKey: 'dashscope',
    displayName: { zh: 'Qwen-Image-Edit-Max', en: 'Qwen-Image-Edit-Max' },
    description: { zh: '按提示词改写已有图片，支持 1–3 张参考图', en: 'Rewrite an existing image by prompt, 1–3 reference images' },
    badge: { zh: '编辑', en: 'Edit' },
    tier: 'QUALITY',
    creditCost: 10,
    capabilities: {
      ...TEXT_CAPS,
      // 实测：这个模型给 0 张图会直接报 "must contain 1~3 image content items"，做不了纯文生图
      modes: modesOn(['imageToImage', 'styleTransfer']),
      maxReferenceImages: 3,
      // 'style' 必须列进来：registry 的 assertSupported 会逐个角色比对 referenceRoles，
      // 漏了它风格迁移会在提交那一步被自己的门控挡下。
      // 'subject'（「形象」功能的角色参考图）要实测过才进得来，见 SUBJECT_VERIFIED
      referenceRoles: editRefRoles('qwen-image-edit'),
      /**
       * ★ 曾经写的是 true —— 但 submit() 组 parameters 时只放了
       *   size / n / watermark / prompt_extend / seed，**从来没发过 strength**。
       *   于是 UI 亮着一个强度滑杆、用户拖了半天，服务端拿到 422 都不会报，
       *   值被静默丢弃 —— 一个会撒谎的控件。
       *   真名没对着厂商验过之前，不对外声明（同 ofox「不给不认的模型塞 size」那条纪律）。
       */
      supportsStrength: false,
      typicalLatencyMs: [10_000, 40_000],
    },
    sortOrder: 13,
    enabled: true,
    isVisible: true,
    isDefault: false,
  },
];

/** 百炼错误体是 { code, message, request_id }，但网关层出错时会直接吐纯文本。 */
function mapHttpError(status: number, parsed: unknown, text: string): ProviderError {
  const body = parsed as { code?: string; message?: string } | null;
  const code = String(body?.code ?? '');
  const message =
    body?.message ?? (text.trim().slice(0, 300) || `百炼返回 HTTP ${status}`);
  const opts = { httpStatus: status, raw: parsed ?? text.slice(0, 1000) };

  if (status === 401 || status === 403) {
    return new ProviderError('auth_failed', message, opts);
  }
  if (status === 429) return new ProviderError('rate_limited', message, opts);
  if (status >= 500) return new ProviderError('upstream_error', message, opts);
  // 内容审核命中：这类重试也没用，必须走立即退款而不是指数退避
  if (/DataInspection|sensitive|risk|filter|policy/i.test(code) || /敏感|违规|审核/.test(message)) {
    return new ProviderError('content_filtered', message, opts);
  }
  return new ProviderError('invalid_request', message, opts);
}

/** 百炼给的是 OSS 临时 URL（约 24 小时有效），过期前必须取走字节 */
async function downloadImage(url: string, signal: AbortSignal): Promise<Buffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new ProviderError('upstream_error', `下载百炼出图失败 HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

type DashscopeBody = {
  output?: { choices?: { message?: { content?: { image?: string }[] } }[] };
};

// ───────────────────────── 提示词助手（文本模型） ─────────────────────────

/**
 * 润色 / 翻译走 OpenAI 兼容端点：同一把 key、同一个地域，
 * 格式比原生 text-generation 端点省事，也不必再记一套参数名。
 */
const TEXT_ENDPOINT =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
/** 短文本任务，qwen-flash 够用且最便宜 —— 一次润色约几百 token，成本可忽略 */
const TEXT_MODEL = 'qwen-flash';
/** 它只是个辅助按钮，30 秒没回就该让用户知道，而不是干等 */
const TEXT_TIMEOUT_MS = 30_000;

/**
 * ★ 规则 2 是整个提示词里最重要的一条。
 *
 * 旧版 mock 的润色是无条件追加「高细节，8K，专业摄影」，后果是：用户选了
 * 「16 位像素」或「干脆线稿」再点一下润色，提示词里被塞进 8K 摄影，
 * 风格当场报废 —— 而润色结果是直接覆盖输入框的，用户未必察觉。
 * 画质与风格归风格预设管，润色只补「主体细节 / 环境 / 光线 / 构图」。
 */
const ENHANCE_SYSTEM_ZH = [
  '你是 AI 绘图提示词的润色助手，把用户的一句话扩写成更具体的画面描述。',
  '',
  '规则：',
  '1. 只补充「主体细节、环境、光线、构图」四类信息，绝不改变用户原本想画的内容。',
  // 「细节丰富」是实测漏网的：禁用词清单里只写了英文的 highly detailed，
  // 模型就用中文等价物补了回来。中文清单必须自己写全。
  '2. 禁止添加任何画质词或风格词，例如 8K、高清、超清、杰作、细节丰富、精细刻画、',
  '   专业摄影、电影感、写实、',
  '   best quality、highly detailed。画风由用户选定的风格预设单独负责，你加了会与它打架，',
  '   会把像素画、线稿、水彩这类风格直接毁掉。',
  '3. 用逗号分隔的短语，不要写成完整句子。',
  '4. 全文不超过 60 个词。',
  '5. 保持用户使用的语言。',
  '6. 只输出润色后的提示词本身，不要任何解释、标题或 Markdown 标记。',
].join('\n');

const ENHANCE_SYSTEM_EN = [
  'You rewrite short image-generation prompts into more specific scene descriptions.',
  '',
  'Rules:',
  '1. Only add detail about the subject, environment, lighting and composition.',
  '   Never change what the user asked to draw.',
  '2. Never add quality or style words: no "8K", "high quality", "masterpiece",',
  '   "professional photography", "cinematic", "photorealistic", "highly detailed".',
  '   The chosen style preset owns the art direction; adding these fights it and',
  '   destroys styles like pixel art, line art and watercolor.',
  '3. Use comma-separated phrases, not full sentences.',
  '4. Stay under 60 words.',
  '5. Keep the language the user wrote in.',
  '6. Output the prompt only — no explanation, heading or Markdown.',
].join('\n');

const TRANSLATE_SYSTEM = [
  '你是 AI 绘图提示词的翻译器，把用户给出的提示词翻译成英文。',
  '',
  '规则：',
  '1. 只输出译文，不要任何解释、标注或引号。',
  '2. 保留原有的逗号分隔结构，逐段对应翻译。',
  '3. 不添加、不删除、不润色任何描述内容。',
  '4. 使用图像生成模型习惯的英文表达，例如「水墨」译作 ink wash painting、',
  '   「工笔」译作 gongbi fine-line painting、「赛博朋克」译作 cyberpunk。',
].join('\n');

/**
 * 调一次文本模型。
 *
 * 不直接用 ctx.signal：那是整个 HTTP 请求的 signal，用户不主动断开就永远不触发，
 * 而这里要的是「30 秒没回就放弃」，所以再并上一个超时 signal。
 */
async function chat(
  messages: { role: 'system' | 'user'; content: string }[],
  temperature: number,
  ctx: ProviderContext,
): Promise<string> {
  if (!env.DASHSCOPE_API_KEY) {
    throw new ProviderError('auth_failed', '未配置 DASHSCOPE_API_KEY');
  }

  const res = await fetch(TEXT_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: TEXT_MODEL, messages, temperature }),
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(TEXT_TIMEOUT_MS)]),
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null; // 网关错误页不是 JSON
  }
  if (!res.ok) {
    /**
     * 免费额度用尽 —— 账户处于「仅免费额度」模式，且该文本模型的免费额度已耗尽。
     * 这不是故障而是账单状态。直接把百炼的英文原文抛给用户，他只会以为网站坏了，
     * 所以翻译成人话并指明去哪里解决。
     */
    if (/FreeTierOnly|Free quota exhausted/i.test(text)) {
      throw new ProviderError(
        'quota_exhausted',
        '提示词助手的免费额度已用尽，请到百炼控制台开通付费后重试',
        { httpStatus: res.status, raw: parsed },
      );
    }
    throw mapHttpError(res.status, parsed, text);
  }

  const out = (parsed as { choices?: { message?: { content?: string } }[] } | null)
    ?.choices?.[0]?.message?.content?.trim();
  if (!out) {
    throw new ProviderError('upstream_error', '文本模型返回了空结果', { raw: parsed });
  }
  return out;
}

export const dashscopeProvider: ImageProvider = {
  key: 'dashscope',
  models: MODELS,

  async submit(req: GenerateRequest, ctx: ProviderContext): Promise<SubmitResult> {
    const vendorModel = VENDOR_MODEL[ctx.model.id];
    if (!vendorModel) {
      throw new ProviderError('invalid_request', `百炼模型未映射：${ctx.model.id}`);
    }
    if (!env.DASHSCOPE_API_KEY) {
      throw new ProviderError('auth_failed', '未配置 DASHSCOPE_API_KEY');
    }

    // 只声明了这三种模式；真收到别的说明门控被绕过了，宁可明确报错
    if (
      req.mode !== 'textToImage' &&
      req.mode !== 'imageToImage' &&
      req.mode !== 'styleTransfer'
    ) {
      throw new ProviderError(
        'invalid_request',
        `百炼这条路只支持文生图 / 图生图 / 风格迁移，收到 ${req.mode}`,
      );
    }

    const { width, height } = resolveDimensions(req.aspectRatio, req.resolution);
    const area = width * height;
    if (area < MIN_AREA || area > MAX_AREA) {
      throw new ProviderError(
        'invalid_request',
        `百炼只接受 512²–2048² 的总像素，当前 ${width}×${height}（${area}）`,
      );
    }

    // 编辑模型要求 1~3 张输入图，且图片项必须排在文字之前
    // （地址的绝对化统一在 executor 的 toRef 里做，这里只管用）
    // ★ 风格迁移是两张图，顺序不能反：第一张是内容图、第二张才是风格图 ——
    //   prompt 里那句「把参考图…」指的就是第二张
    //   2026-09-21 实测：彩铅狐狸 + 灰调混凝土建筑 → 狐狸的构图主体全保住、整体褪成参考图那种
    //   灰调柔光。说明第二张确实被当成风格读了（不是被忽略，也不是被当成内容）。
    //   顺带验到一件事：**本站 /api/files/public/... 的 URL 从阿里云那边抓得到**，
    //   风格迁移要在 app 里成立全靠这个 —— 图片项只能传 URL，传不了字节。
    //   注意它迁的是**色调/质感**，不是把主体改成参考图的东西；官方叫「风格迁移」，
    //   实际偏「调色迁移」，别指望它把照片变成油画。
    const imageUrls =
      req.mode === 'textToImage'
        ? []
        : [
            req.initImage.url,
            ...(req.mode === 'styleTransfer' ? [req.styleImage.url] : []),
            ...(req.references ?? []).map((r) => r.url),
          ];
    const content: Record<string, unknown>[] = [
      ...imageUrls.map((url) => ({ image: url })),
      { text: req.prompt },
    ];

    const parameters: Record<string, unknown> = {
      size: `${width}*${height}`,
      n: 1,
      watermark: false,
      // 关掉自动扩写：用户写的提示词就是用户要的，不该被悄悄改写
      prompt_extend: false,
    };
    if (req.seed) parameters.seed = Number(req.seed);

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: vendorModel,
        input: { messages: [{ role: 'user', content }] },
        parameters,
      }),
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

    const parts = (parsed as DashscopeBody | null)?.output?.choices?.[0]?.message?.content ?? [];
    const urls = parts.map((c) => c.image).filter((u): u is string => Boolean(u));
    if (urls.length === 0) {
      throw new ProviderError('upstream_error', '百炼返回了空结果', { raw: parsed });
    }

    const images = await Promise.all(
      urls.map(
        async (url, i): Promise<GeneratedImage> => ({
          index: i,
          data: await downloadImage(url, ctx.signal),
          mimeType: 'image/png',
          // 0 会让 persist 用 deriveAssets 实测的尺寸兜底，比按画幅猜的准
          width: 0,
          height: 0,
          seed: req.seed,
        }),
      ),
    );

    return { kind: 'sync', images, raw: { model: vendorModel, count: images.length } };
  },

  async enhancePrompt({ prompt, locale, styleHint }, ctx) {
    const zh = locale.startsWith('zh');
    const lines = [zh ? `用户的原话：${prompt}` : `User's prompt: ${prompt}`];
    if (styleHint) {
      lines.push(
        zh
          ? `用户已选定的画风：${styleHint}。不要再复述画风，只补画面内容。`
          : `Style preset already chosen: ${styleHint}. Do not restate it, only add scene detail.`,
      );
    }

    const enhancedPrompt = await chat(
      [
        { role: 'system', content: zh ? ENHANCE_SYSTEM_ZH : ENHANCE_SYSTEM_EN },
        { role: 'user', content: lines.join('\n') },
      ],
      0.7,
      ctx,
    );

    /**
     * 不返回 negativePrompt：本端点静默忽略该参数（2026-09-15 对照实验 ——
     * negative 里塞满 "cat, feline, animal, 猫" 仍出了完整一只猫）。
     * 返回了只会让调用方以为反向提示词生效了。
     */
    return { enhancedPrompt };
  },

  async translatePrompt({ text }, ctx) {
    const out = await chat(
      [
        { role: 'system', content: TRANSLATE_SYSTEM },
        { role: 'user', content: text },
      ],
      0.2,
      ctx,
    );
    return { text: out };
  },
};
