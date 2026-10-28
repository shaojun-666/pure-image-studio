import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { resolveDimensions } from '@/lib/ai/aspect';
import {
  ASPECT_RATIOS,
  CONTROL_TYPES,
  GENERATION_MODES,
  REFERENCE_ROLES,
  type GenerateRequest,
  type GeneratedImage,
  type GenerationMode,
  type ModelCapabilities,
  type ModelDescriptor,
} from '@/lib/ai/contracts';
import { env } from '../env';
import { ProviderError } from './errors';
import type {
  ImageProvider,
  PollResult,
  ProviderContext,
  SubmitResult,
} from './types';

/**
 * 本地出图 provider：不依赖任何外部服务，但产出的是**真 PNG**。
 * 同 seed + 同 prompt + 同 index 必得同一张图 ——
 * 因此异步轮询可以完全无状态：jobId 里自带全部参数，进程重启也不丢。
 *
 * ★ 接入真实厂商时照抄这个文件的结构：模型描述、能力开关、submit/poll 都放在
 *    provider 自己内部，然后在 providers/index.ts 的 PROVIDERS 里加一行。
 */

// ───────────────────────── 模型描述（本文件的权威来源） ─────────────────────────

const allModes = () =>
  Object.fromEntries(GENERATION_MODES.map((m) => [m, true])) as Record<
    GenerationMode,
    boolean
  >;

const FULL_CAPABILITIES: ModelCapabilities = {
  modes: allModes(),
  maxBatch: 8,
  maxReferenceImages: 9,
  referenceRoles: [...REFERENCE_ROLES],
  controlTypes: [...CONTROL_TYPES],
  supportedAspectRatios: [...ASPECT_RATIOS],
  supportedResolutions: ['1K', '2K', '4K'],
  supportsNegativePrompt: true,
  supportsSeed: true,
  supportsGuidance: true,
  supportsMask: true,
  supportsStrength: true,
  supportsTransparentOutput: true,
  maxPromptChars: 2000,
  async: false,
  typicalLatencyMs: [800, 2500],
};

/** 只做文生图的轻量模型：用来验证能力门控真的会把 UI 置灰 */
const TEXT_ONLY_CAPABILITIES: ModelCapabilities = {
  ...FULL_CAPABILITIES,
  modes: {
    ...allModes(),
    imageToImage: false,
    inpaint: false,
    outpaint: false,
    removeBackground: false,
    upscale: false,
    styleTransfer: false,
    removeObject: false,
  },
  maxBatch: 4,
  maxReferenceImages: 0,
  referenceRoles: [],
  controlTypes: [],
  supportsMask: false,
  supportsStrength: false,
  supportedResolutions: ['1K', '2K'],
  typicalLatencyMs: [600, 1800],
};

/**
 * isVisible 全部为 false：mock 只该出现在开发调试和验收脚本里，不该出现在用户的下拉框。
 * 用户看到一个叫「闪电 1.0」的模型会直接问「这是什么」。
 * 设置 isVisible: true 可以把它重新放回下拉框，用于验证能力门控的置灰效果。
 */
const MODELS: ModelDescriptor[] = [
  {
    id: 'mock-flash',
    providerKey: 'mock',
    displayName: { zh: '闪电 1.0', en: 'Flash 1.0' },
    description: {
      zh: '出图最快的轻量模型，适合快速试想法',
      en: 'The fastest lightweight model for quick ideation',
    },
    badge: { zh: '极速', en: 'Fast' },
    tier: 'FAST',
    creditCost: 2,
    capabilities: { ...FULL_CAPABILITIES, async: false },
    sortOrder: 10,
    enabled: true,
    isVisible: false,
    // 默认模型是 qwen-image-3（dashscope）。mock 仍留在目录里供调试，但不再是首屏默认。
    isDefault: false,
  },
  {
    id: 'mock-pro',
    providerKey: 'mock',
    displayName: { zh: '臻绘 2.0', en: 'Pro 2.0' },
    description: {
      zh: '细节与控制力更强，值得多等一会儿',
      en: 'More detail and control, worth the extra wait',
    },
    badge: { zh: '高质量', en: 'Quality' },
    tier: 'QUALITY',
    creditCost: 6,
    capabilities: {
      ...FULL_CAPABILITIES,
      async: true,
      typicalLatencyMs: [6000, 15000],
    },
    sortOrder: 20,
    enabled: true,
    isVisible: false,
    isDefault: false,
  },
  {
    id: 'mock-ultra',
    providerKey: 'mock',
    displayName: { zh: '天工 Ultra', en: 'Ultra' },
    description: {
      zh: '最高画质档，仅支持文生图',
      en: 'Highest fidelity tier, text-to-image only',
    },
    badge: { zh: '旗舰', en: 'Ultra' },
    tier: 'ULTRA',
    creditCost: 12,
    capabilities: {
      ...TEXT_ONLY_CAPABILITIES,
      supportedResolutions: ['2K', '4K'],
      typicalLatencyMs: [15000, 40000],
      async: true,
    },
    sortOrder: 30,
    enabled: true,
    isVisible: false,
    isDefault: false,
  },
];

const MODE_LABEL: Record<GenerationMode, string> = {
  textToImage: '文生图',
  imageToImage: '图生图',
  inpaint: '局部重绘',
  outpaint: '扩图',
  removeBackground: '抠图',
  upscale: '放大增强',
  styleTransfer: '风格迁移',
  removeObject: '对象消除',
};

// ───────────────────────── 确定性伪随机 ─────────────────────────

/** mulberry32：同一 seed 产出同一序列，跨进程稳定 */
function prng(seed: string): () => number {
  const h = createHash('sha256').update(seed).digest();
  let a = h.readUInt32LE(0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── SVG 合成 ─────────────────────────

function escapeXml(s: string): string {
  return s.replace(
    /[<>&"']/g,
    (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[
        c
      ]!,
  );
}

const FONT_STACK =
  "Inter, 'Noto Sans CJK SC', 'Microsoft YaHei', 'PingFang SC', sans-serif";

function buildSvg(o: {
  width: number;
  height: number;
  mode: GenerationMode;
  prompt: string;
  seed: string;
  index: number;
  /** 抠图：不画底色与暗角，PNG 才有真实 alpha */
  transparent?: boolean;
}): string {
  const { width: w, height: h } = o;
  const rand = prng(`${o.prompt}|${o.seed}|${o.index}|${o.mode}`);
  const min = Math.min(w, h);

  const hue = Math.floor(rand() * 360);
  const hue2 = (hue + 60 + Math.floor(rand() * 180)) % 360;
  const bg1 = `hsl(${hue} 55% ${8 + Math.floor(rand() * 10)}%)`;
  const bg2 = `hsl(${hue2} 60% ${14 + Math.floor(rand() * 14)}%)`;

  // 18 个径向渐变光斑 —— 用渐变而非高斯模糊滤镜，4K 下快一个数量级
  const blobs = Array.from({ length: 18 }, (_, i) => {
    const cx = Math.round(rand() * w);
    const cy = Math.round(rand() * h);
    const r = Math.round((0.10 + rand() * 0.26) * min);
    const bh = Math.floor(rand() * 360);
    const sat = 70 + Math.floor(rand() * 25);
    const light = 55 + Math.floor(rand() * 20);
    const alpha = (0.30 + rand() * 0.45).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#b${i})" opacity="${alpha}"/>
    <radialGradient id="b${i}">
      <stop offset="0%" stop-color="hsl(${bh} ${sat}% ${light}%)"/>
      <stop offset="100%" stop-color="hsl(${bh} ${sat}% ${light}%)" stop-opacity="0"/>
    </radialGradient>`;
  }).join('\n  ');

  const fs = Math.max(13, Math.round(w * 0.021));
  const pad = Math.round(fs * 1.1);
  const label = escapeXml(MODE_LABEL[o.mode]);
  const text = escapeXml(
    o.prompt.length > 60 ? `${o.prompt.slice(0, 60)}…` : o.prompt || label,
  );
  const meta = escapeXml(`seed ${o.seed} · #${o.index}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="50%" r="72%">
      <stop offset="45%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.62"/>
    </radialGradient>
  </defs>
  ${o.transparent ? '' : `<rect width="${w}" height="${h}" fill="url(#bg)"/>`}
  <g>
  ${blobs}
  </g>
  ${o.transparent ? '' : `<rect width="${w}" height="${h}" fill="url(#vig)"/>`}
  <g font-family="${FONT_STACK}" fill="#fff">
    <rect x="${pad}" y="${pad}" rx="${fs * 0.5}" width="${label.length * fs + pad * 1.6}" height="${fs * 2}" fill="#000" opacity="0.42"/>
    <text x="${pad * 1.4}" y="${pad + fs * 1.42}" font-size="${fs}" font-weight="600">${label}</text>
    <text x="${pad}" y="${h - pad * 2.2}" font-size="${fs}" opacity="0.92">${text}</text>
    <text x="${pad}" y="${h - pad * 0.9}" font-size="${fs * 0.82}" opacity="0.6">${meta}</text>
  </g>
</svg>`;
}

// ───────────────────────── 尺寸 ─────────────────────────

const MAX_EDGE = 4096;

function clampEdge(width: number, height: number) {
  const long = Math.max(width, height);
  if (long <= MAX_EDGE) return { width, height };
  const k = MAX_EDGE / long;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** 放大 / 扩图的输出尺寸由源图决定，其余由宽高比 + 分辨率决定 */
function targetSize(req: GenerateRequest): { width: number; height: number } {
  if (req.mode === 'upscale') {
    const { width, height } = req.initImage;
    return clampEdge(width * req.factor, height * req.factor);
  }
  if (req.mode === 'outpaint') {
    const { width, height } = req.initImage;
    return clampEdge(
      width + req.expand.left + req.expand.right,
      height + req.expand.top + req.expand.bottom,
    );
  }
  // 其余带底图的模式（重绘 / 抠图 / 风格迁移…）必须与源图同尺寸：
  // 尺寸一变，蒙版就对不上像素，抠图的 alpha 也会错位。
  if ('initImage' in req) {
    return clampEdge(req.initImage.width, req.initImage.height);
  }
  return resolveDimensions(req.aspectRatio, req.resolution);
}

// ───────────────────────── 无状态 job 句柄 ─────────────────────────

interface MockJob {
  /** 提交时刻 */
  t0: number;
  /** 总耗时 */
  dur: number;
  w: number;
  h: number;
  n: number;
  /** 基础 seed（十进制字符串），第 i 张用 seed+i */
  s: string;
  m: GenerationMode;
  p: string;
  fail?: boolean;
  timeout?: boolean;
}

function encodeJob(job: MockJob): string {
  return `mockjob:${Buffer.from(JSON.stringify(job), 'utf8').toString('base64url')}`;
}

function decodeJob(jobId: string): MockJob {
  if (!jobId.startsWith('mockjob:')) {
    throw new ProviderError('invalid_request', `无法识别的 providerJobId：${jobId}`);
  }
  return JSON.parse(
    Buffer.from(jobId.slice('mockjob:'.length), 'base64url').toString('utf8'),
  ) as MockJob;
}

// ───────────────────────── 渲染 ─────────────────────────

async function renderBatch(job: MockJob): Promise<GeneratedImage[]> {
  const out: GeneratedImage[] = [];
  for (let i = 0; i < job.n; i++) {
    const seed = (BigInt(job.s) + BigInt(i)).toString();
    const svg = buildSvg({
      width: job.w,
      height: job.h,
      mode: job.m,
      prompt: job.p,
      seed,
      index: i,
      transparent: job.m === 'removeBackground',
    });
    const data = await sharp(Buffer.from(svg), { density: 72 })
      .resize(job.w, job.h)
      .png({ compressionLevel: 6 })
      .toBuffer();
    out.push({
      index: i,
      data,
      mimeType: 'image/png',
      width: job.w,
      height: job.h,
      seed,
    });
  }
  return out;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ───────────────────────── Provider ─────────────────────────

/**
 * MOCK_ASYNC 强制所有模型走异步，用来验证轮询路径与同步路径等价。
 * 能力声明必须跟着变 —— executor 是按 capabilities.async 决定分块还是等句柄的，
 * 声明同步却返回异步句柄会被当成 provider 违约。
 */
const EFFECTIVE_MODELS: ModelDescriptor[] = env.MOCK_ASYNC
  ? MODELS.map((m) => ({
      ...m,
      capabilities: { ...m.capabilities, async: true },
    }))
  : MODELS;

export const mockProvider: ImageProvider = {
  key: 'mock',
  models: EFFECTIVE_MODELS,

  async submit(req, ctx): Promise<SubmitResult> {
    const roll = prng(`${ctx.requestId}|${ctx.userId}|${req.prompt}`);
    const fail = env.MOCK_FAILURE_RATE > 0 && roll() < env.MOCK_FAILURE_RATE;
    const timeout =
      env.MOCK_TIMEOUT_RATE > 0 && roll() < env.MOCK_TIMEOUT_RATE;
    const dur = Math.max(
      50,
      Math.round(env.MOCK_LATENCY_MS * (0.75 + roll() * 0.5)),
    );
    const { width, height } = targetSize(req);
    const seed = req.seed ?? String(Date.now());

    // MOCK_ASYNC 强制走异步，用来验证轮询路径与同步路径等价
    const isAsync = env.MOCK_ASYNC || ctx.model.capabilities.async;

    if (isAsync) {
      return {
        kind: 'async',
        providerJobId: encodeJob({
          t0: Date.now(),
          dur,
          w: width,
          h: height,
          n: req.batchCount,
          s: seed,
          m: req.mode,
          p: req.prompt,
          fail,
          timeout,
        }),
        pollAfterMs: dur + 150,
        estimatedTotalMs: dur,
      };
    }

    await sleep(dur, ctx.signal);
    if (timeout) {
      // 睡到执行器的 AbortController 先触发，验证超时路径
      await sleep(env.PROVIDER_TIMEOUT_MS * 3, ctx.signal);
    }
    if (fail) {
      throw new ProviderError(
        'upstream_error',
        'Mock 上游返回失败（MOCK_FAILURE_RATE）',
        { httpStatus: 502 },
      );
    }
    const images = await renderBatch({
      t0: 0,
      dur,
      w: width,
      h: height,
      n: req.batchCount,
      s: seed,
      m: req.mode,
      p: req.prompt,
    });
    return { kind: 'sync', images };
  },

  async poll({ providerJobId }, ctx): Promise<PollResult> {
    const job = decodeJob(providerJobId);
    const elapsed = Date.now() - job.t0;

    if (job.timeout || elapsed < job.dur) {
      return {
        status: 'running',
        progress: Math.min(0.95, elapsed / job.dur),
        retryAfterMs: Math.max(300, job.dur - elapsed),
      };
    }
    if (job.fail) {
      return {
        status: 'failed',
        error: {
          code: 'upstream_error',
          message: 'Mock 上游返回失败（MOCK_FAILURE_RATE）',
          retryable: true,
          httpStatus: 502,
        },
      };
    }
    return { status: 'succeeded', images: await renderBatch(job) };
  },

  async enhancePrompt({ prompt, locale }) {
    // 模板化改写，0 积分。接真实模型时替换为一次文本模型调用。
    //
    // ★ 这里绝不能注入「8K / 专业摄影 / 电影级」这类画质与风格词。
    //   原版就是这么写的，后果是：用户选了「16 位像素」或「干脆线稿」再点润色，
    //   提示词里被塞进「高细节，8K，专业摄影」，风格当场报废 ——
    //   而润色结果是**直接覆盖输入框**的，用户未必察觉自己刚毁了这张图。
    //   风格归风格预设管，润色只补「环境 / 光线 / 构图」这类中性信息。
    const zh = locale.startsWith('zh');
    const parts = zh
      ? [prompt.trim(), '环境交代清楚', '光线自然', '构图平衡，主体突出']
      : [
          prompt.trim(),
          'clear environment',
          'natural light',
          'balanced composition, clear focal point',
        ];
    return {
      enhancedPrompt: parts.filter(Boolean).join(zh ? '，' : ', '),
      negativePrompt: zh
        ? '低分辨率，模糊，变形，多余手指，水印，文字'
        : 'lowres, blurry, deformed, extra fingers, watermark, text',
    };
  },

  async translatePrompt({ text }) {
    // Mock 不做真翻译：原样透传，但把常见的几个词做个替换，方便肉眼验证链路
    const glossary: Record<string, string> = {
      猫: 'cat',
      狗: 'dog',
      风景: 'landscape',
      女孩: 'girl',
      赛博朋克: 'cyberpunk',
      水墨: 'ink wash painting',
      日落: 'sunset',
    };
    let out = text;
    for (const [zh, en] of Object.entries(glossary)) {
      out = out.replaceAll(zh, en);
    }
    return { text: out };
  },
};
