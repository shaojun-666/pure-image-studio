/**
 * Phase 8 接缝验证：接入新厂商是否真的只靠「一个 provider 文件 + index 一行」。
 *
 *   ARK_API_KEY=test DATABASE_URL=... AUTH_SECRET=... pnpm tsx scripts/verify-phase8.ts
 *
 * ★ fetch 是打桩的。这个脚本验的是**接缝**——能力门控、送出去的请求体契约、
 *   错误分类，不是厂商行为。真实出图必须拿到 key 后另行验。
 */
// 顶层 await 要求本文件是模块；这里全是动态 import，得显式标一下
export {};

// env 在 import 期就校验，必须先落好
process.env.ARK_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgresql://x:x@127.0.0.1:5432/x';
process.env.AUTH_SECRET ??= 'phase8-verify-secret-0123456789';

const { volcengineProvider } = await import('../src/server/providers/volcengine');
const { flatCatalog } = await import('../src/server/providers/index');

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// ── 打桩 ──────────────────────────────────────────────────────────
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let sentBody: Record<string, unknown> | null = null;
let nextStatus = 200;
let nextPayload: unknown = { data: [{ b64_json: PNG_1PX }] };

globalThis.fetch = (async (_url: string, init: RequestInit) => {
  sentBody = JSON.parse(String(init.body));
  return new Response(JSON.stringify(nextPayload), {
    status: nextStatus,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

/** TS 看不穿 fetch 打桩内部的赋值，读的时候重新断言一次 */
const sent = () => sentBody as Record<string, unknown> | null;

const ctx = {
  signal: new AbortController().signal,
  model: undefined as never,
  requestId: 'req-1',
  userId: 'u-1',
  logger: { debug() {}, info() {}, warn() {}, error() {} },
};

const base = {
  prompt: '一只猫',
  aspectRatio: '16:9' as const,
  resolution: '2K' as const,
  batchCount: 1,
};

// ── 1. 模型目录 ────────────────────────────────────────────────────
console.log('\n[1] 模型目录');
const catalog = flatCatalog();
const vk = catalog.filter((m) => m.providerKey === 'volcengine');
check('控制台上开通的四个型号都进了目录', vk.length === 4, vk.map((m) => m.id).join(','));
check(
  '3.0 已移出目录（厂商侧平台已下线，留着就是个必然失败的按钮）',
  !vk.some((m) => m.id === 'seedream-3-t2i'),
);
check('新模型默认可见', vk.every((m) => m.enabled && m.isVisible));

// ── 2. 能力门控数据 ────────────────────────────────────────────────
console.log('\n[2] 能力门控（前端据此置灰，一行前端代码没动）');
const s4 = vk.find((m) => m.id === 'seedream-4')!;
const s45 = vk.find((m) => m.id === 'seedream-4-5')!;
const s5 = vk.find((m) => m.id === 'seedream-5')!;
const off = [
  'inpaint',
  'outpaint',
  'removeBackground',
  'upscale',
  'styleTransfer',
  'removeObject',
] as const;
check('seedream-4 只开文生图 + 图生图', s4.capabilities.modes.textToImage && s4.capabilities.modes.imageToImage);
check(
  `6 个不支持的模式全部为 false`,
  off.every((m) => s4.capabilities.modes[m] === false),
  off.filter((m) => s4.capabilities.modes[m]).join(',') || '无遗漏',
);
check(
  '实测通过的型号都开了 subject（形象参考图）',
  vk.every((m) => m.capabilities.referenceRoles.includes('subject')),
);
check(
  '像素下限高的型号不给 1K 档',
  s4.capabilities.supportedResolutions.includes('1K') &&
    s45.capabilities.supportedResolutions.join() === '2K' &&
    s5.capabilities.supportedResolutions.join() === '2K',
  `4.0=${s4.capabilities.supportedResolutions.join('/')} 4.5=${s45.capabilities.supportedResolutions.join('/')}`,
);
check('不声明 4K（4K 档没实测过）', !s4.capabilities.supportedResolutions.includes('4K'));
check('maxBatch=1 → executor 切块串行', s4.capabilities.maxBatch === 1);

// ── 3. 送出去的请求体契约 ──────────────────────────────────────────
console.log('\n[3] 请求体契约');
const ok = await volcengineProvider.submit(
  { ...base, mode: 'textToImage' },
  { ...ctx, model: s4 },
);
check('同步返回', ok.kind === 'sync');
check(
  'model 映射到方舟 id',
  sent()?.model === 'doubao-seedream-4-0-20260415',
  String(sent()?.model),
);
// 预设档（'2k'）只认小写、而且出的是方框 —— 会把用户选的画幅整个吃掉，所以发宽高
check('size 发显式宽高，不是预设档', sent()?.size === '2048x1152', String(sent()?.size));
check('要 b64_json 避开临时 URL 过期', sent()?.response_format === 'b64_json');
check('关水印', sent()?.watermark === false);
check('图生图才带 image', sent()?.image === undefined);

// 4.5 的下限是 3,686,400 —— 3:4 的 2K（1536×2048 = 3,145,728）够不着，
// 必须等比放大到下限之上，但**画幅不能动**。
await volcengineProvider.submit(
  { ...base, mode: 'textToImage', aspectRatio: '3:4' },
  { ...ctx, model: s45 },
);
const [tw, th] = String(sent()?.size).split('x').map(Number);
check(
  '低于下限时等比放大：仍 ≥ 下限且画幅不变',
  tw * th >= 3_686_400 && Math.abs(tw / th - 3 / 4) < 0.01,
  `${tw}x${th} = ${tw * th}px，比值 ${(tw / th).toFixed(4)}`,
);

if (ok.kind === 'sync') {
  const bytes = Buffer.from(ok.images[0].data);
  check('base64 解出的是真 PNG', bytes.subarray(1, 4).toString() === 'PNG', bytes.subarray(0, 4).toString('hex'));
  check('尺寸交给 persist 实测兜底', ok.images[0].width === 0 && ok.images[0].height === 0);
}

// 图生图：参考图直接给签名 URL，不下载再编码
sentBody = null;
await volcengineProvider.submit(
  {
    ...base,
    mode: 'imageToImage',
    strength: 0.6,
    initImage: { role: 'init', assetId: 'a1', url: 'https://cdn.test/a.png', mimeType: 'image/png', width: 8, height: 8 },
  },
  { ...ctx, model: s4 },
);
check('单张参考图序列化成字符串', sent()?.image === 'https://cdn.test/a.png', JSON.stringify(sent()?.image));

sentBody = null;
await volcengineProvider.submit(
  {
    ...base,
    mode: 'textToImage',
    references: [
      { role: 'reference', assetId: 'a2', url: 'https://cdn.test/b.png', mimeType: 'image/png', width: 8, height: 8 },
      { role: 'reference', assetId: 'a3', url: 'https://cdn.test/c.png', mimeType: 'image/png', width: 8, height: 8 },
    ],
  },
  { ...ctx, model: s4 },
);
check('多张参考图序列化成数组', Array.isArray(sent()?.image) && (sent()?.image as unknown[]).length === 2);

// ── 4. 错误分类决定「重试还是退款」 ────────────────────────────────
console.log('\n[4] 错误分类（错一档就是重复扣费或错退款）');
const cases: [number, unknown, string, boolean][] = [
  [401, { error: { code: 'AuthenticationError', message: 'bad key' } }, 'auth_failed', false],
  [429, { error: { code: 'RateLimitExceeded', message: 'slow down' } }, 'rate_limited', true],
  [500, { error: { code: 'InternalError', message: 'oops' } }, 'upstream_error', true],
  [400, { error: { code: 'SensitiveContent', message: 'blocked' } }, 'content_filtered', false],
  [400, { error: { code: 'InvalidParameter', message: 'bad size' } }, 'invalid_request', false],
];

for (const [status, payload, wantCode, wantRetry] of cases) {
  nextStatus = status;
  nextPayload = payload;
  let got: { code: string; retryable: boolean } | null = null;
  try {
    await volcengineProvider.submit({ ...base, mode: 'textToImage' }, { ...ctx, model: s4 });
  } catch (e) {
    got = e as { code: string; retryable: boolean };
  }
  check(
    `HTTP ${status} → ${wantCode}（retryable=${wantRetry}）`,
    got?.code === wantCode && got?.retryable === wantRetry,
    got ? `${got.code}/retryable=${got.retryable}` : '没有抛错',
  );
}

nextStatus = 200;
nextPayload = { data: [] };
let emptyErr: { code: string } | null = null;
try {
  await volcengineProvider.submit({ ...base, mode: 'textToImage' }, { ...ctx, model: s4 });
} catch (e) {
  emptyErr = e as { code: string };
}
check('空结果算上游故障，不是静默成功', emptyErr?.code === 'upstream_error');

// ── 5. 没配 key 就不该出现在目录里 ─────────────────────────────────
console.log('\n[5] 未配置 key 的厂商');
const { PROVIDERS } = await import('../src/server/providers/index');
check('配了 key → 注册', 'volcengine' in PROVIDERS && 'mock' in PROVIDERS);

console.log(
  failures ? `\n❌ Phase 8 接缝验证失败 ${failures} 项\n` : `\n✅ Phase 8 接缝验证全部通过\n`,
);
process.exit(failures ? 1 : 0);
