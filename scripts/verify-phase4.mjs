/**
 * Phase 4 浏览器验收 —— 6 个工具页各自上传图片跑通同一条管道。
 *
 * 覆盖方案里的验收标准：
 *   抠图出透明 PNG、放大 2×/4× 有对比滑块、重绘的蒙版被正确尊重、
 *   扩图拖手柄得到更宽画布、消除、风格迁移；各按模式倍率正确扣费。
 *
 * 「蒙版被尊重」这条落在像素上验：把生成的蒙版 PNG 拉回来，
 * 断言它跟源图同尺寸、涂过的地方是白、没涂的地方是黑。
 * 「扩图更宽」验的是输出实际宽高，不是界面上的文字。
 *
 * 用法：node scripts/verify-phase4.mjs   （需先 pnpm dev）
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

/**
 * 每轮验收开一个新账号，理由有两个，都不是洁癖：
 *  1. 限流窗口 = 该用户最近 5 分钟内的 Generation 行数，上限 10。本脚本一轮提交 7 次，
 *     沿用同一个账号会让第二轮在第 6 次提交时吃到 429，测的就不是功能了。
 *  2. 新账号的流水是干净的，余额差断言不必去猜历史遗留。
 * 注册送 30 + 每日 20 = 50，本轮共花 20，够用。
 */
const EMAIL = `phase4-verify-${Date.now()}@example.test`;
const PASSWORD = 'phase4_verify_pw';

const SRC = { w: 640, h: 480 };
const INPUT = '.data/phase4-input.png';
const STYLE = '.data/phase4-style.png';

/**
 * 期望扣费 = ceil(mock-flash 的 2 积分 × 模式倍率)。
 * 用 mock-flash 是因为它是默认模型（sortOrder 最小），
 * 工具页的模型下拉框会自动选中它，脚本不必额外操作。
 */
const COST = {
  removeBackground: Math.ceil(2 * 0.5), // 1
  upscale2: Math.ceil(2 * 2), // 4
  upscale4: Math.ceil(2 * 2), // 4
  inpaint: Math.ceil(2 * 1.2), // 3
  outpaint: Math.ceil(2 * 1.2), // 3
  removeObject: Math.ceil(2 * 1), // 2
  styleTransfer: Math.ceil(2 * 1.2), // 3
};

let pass = 0;
const ok = (m) => {
  pass++;
  console.log(`  ✅ ${m}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return;
    await sleep(250);
  }
  throw new Error(`超时：${what}`);
}

// ───────────────────────── 测试素材 ─────────────────────────

async function makeFixtures() {
  const svg = (w, h, bg, shapes) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="${bg}"/>${shapes}</svg>`;

  await sharp(
    Buffer.from(
      svg(
        SRC.w,
        SRC.h,
        '#3b2a6b',
        '<circle cx="200" cy="180" r="110" fill="#e2b04a"/>' +
          '<rect x="360" y="230" width="220" height="160" rx="24" fill="#2bb5a0"/>',
      ),
    ),
  )
    .png()
    .toFile(INPUT);

  await sharp(
    Buffer.from(
      svg(512, 512, '#101820', '<circle cx="256" cy="256" r="200" fill="#c2482f"/>'),
    ),
  )
    .png()
    .toFile(STYLE);
}

// ───────────────────────── 浏览器 ─────────────────────────

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 200)));

/** 每次提交前清空，用来断言「这次生成本身传上去了什么」 */
const uploads = [];
page.on('response', async (res) => {
  if (!res.url().includes('/api/uploads') || res.request().method() !== 'POST') return;
  try {
    const j = await res.json();
    if (j.ok) uploads.push(j.data);
  } catch {
    /* 忽略非 JSON */
  }
});

let lastGen = null;
/** 提交请求体：mode 专属字段（maskAssetId / styleAssetId / expand）只在这里看得见 */
let lastGenBody = null;
page.on('response', async (res) => {
  if (!res.url().endsWith('/api/generate') || res.request().method() !== 'POST') return;
  try {
    lastGenBody = JSON.parse(res.request().postData() ?? '{}');
  } catch {
    /* 忽略 */
  }
  try {
    const j = await res.json();
    if (j.ok) lastGen = j.data;
  } catch {
    /* 忽略 */
  }
});

const meJson = async () => (await (await page.request.get(`${BASE}/api/me`)).json()).data;
const balance = async () => (await meJson()).creditBalance;
const genDetail = async (id) =>
  (await (await page.request.get(`${BASE}/api/generations/${id}`)).json()).data;

async function imageBytes(url) {
  const res = await page.request.get(BASE + url);
  assert.equal(res.status(), 200, `取图失败 ${url} → ${res.status()}`);
  return res.body();
}

async function openTool(slug) {
  await page.goto(`${BASE}/zh/tools/${slug}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("选择图片")', { timeout: 30000 });
  // 上面那个 selector 命中的是 SSR HTML，此时 React 可能还没水合。
  // 模型下拉框由客户端 useQuery 填充，它出现才说明表单真的被接管了 ——
  // 早于水合就 setInputFiles，change 事件会落在没有监听器的 DOM 上，静默丢失。
  await page.waitForSelector('[aria-label="模型"]', { timeout: 30000 });

  uploads.length = 0;
  lastGen = null;
  lastGenBody = null;
  // 底图上传时页面上只有 ToolShell 自己那一个 file input
  await page.locator('input[type=file]').first().setInputFiles(INPUT);
  await page.waitForSelector('img[src*="/api/files/"]', { timeout: 30000 });
}

/** 提交 → 等终态 → 断言扣费与余额 */
async function run(expectedCost, label) {
  uploads.length = 0;
  lastGen = null;
  lastGenBody = null;
  const before = await balance();

  await page.click('button:has-text("开始生成")');
  await waitFor(() => lastGen, 30000, `${label} 提交无响应`);

  const id = lastGen.generationId;
  let d;
  await waitFor(
    async () => {
      d = await genDetail(id);
      return ['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED'].includes(d.status);
    },
    120000,
    `${label} 生成未结束`,
  );

  assert.equal(d.status, 'SUCCEEDED', `${label}：${d.status} ${d.errorMessage ?? ''}`);
  assert.equal(d.images.length, 1, `${label}：期望 1 张，实得 ${d.images.length}`);
  assert.equal(d.creditsSpent, expectedCost, `${label}：结算 ${d.creditsSpent}，应 ${expectedCost}`);

  const after = await balance();
  assert.equal(before - after, expectedCost, `${label}：余额 ${before} → ${after}，应扣 ${expectedCost}`);

  // 结果区必须出现对比滑块
  await page.waitForSelector('input[type=range][aria-label="前后对比"]', { timeout: 30000 });
  return d;
}

try {
  await makeFixtures();

  // ---------- 0. 注册 + 登录 ----------
  console.log('\n[0] 注册并登录');
  const reg = await page.request.post(`${BASE}/api/auth/register`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  assert.ok(reg.ok(), `注册失败 ${reg.status()}: ${await reg.text()}`);

  await page.goto(`${BASE}/zh/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
  ok(`登录成功 → ${new URL(page.url()).pathname}`);
  consoleErrors.length = 0;

  // /api/me 自己就会调 claimDailyGrant 把当日额度补上，所以「读一次余额」等价于
  // 「当日赠送已落地」。此后的余额差就是纯粹的扣费额，不需要任何补偿项。
  // 注意 dailyGrant.granted 是「本次请求是否发放」的每请求标志，不是「今日是否已领」，
  // 拿它预判会以为还有一笔 +20 在路上 —— 那笔永远不会来。
  const m0 = await meJson();
  console.log(`  余额 ${m0.creditBalance}`);

  // ---------- 1. 抠图 ----------
  console.log('\n[1] 智能抠图');
  await openTool('background-removal');
  ok('底图已上传');
  {
    const d = await run(COST.removeBackground, '抠图');
    const buf = await imageBytes(d.images[0].url);
    const meta = await sharp(buf).metadata();
    assert.equal(meta.hasAlpha, true, '输出没有 alpha 通道');
    assert.equal(meta.width, SRC.w, `输出宽 ${meta.width}`);
    assert.equal(meta.height, SRC.h, `输出高 ${meta.height}`);
    const stats = await sharp(buf).stats();
    assert.equal(stats.channels[3].min, 0, '没有任何全透明像素 —— 背景没被去掉');
    ok(`透明 PNG ${meta.width}×${meta.height}，含真正透明像素，扣费 ${d.creditsSpent}`);
  }

  // ---------- 2. 放大 ----------
  console.log('\n[2] 高清放大');
  await openTool('upscale');
  for (const [factor, expected] of [[2, COST.upscale2], [4, COST.upscale4]]) {
    await page.click(`button:text-is("${factor}×")`);
    const d = await run(expected, `放大 ${factor}×`);
    const meta = await sharp(await imageBytes(d.images[0].url)).metadata();
    assert.equal(meta.width, SRC.w * factor, `${factor}× 宽 ${meta.width}`);
    assert.equal(meta.height, SRC.h * factor, `${factor}× 高 ${meta.height}`);
    ok(`${factor}× → ${meta.width}×${meta.height}，对比滑块已出现，扣费 ${d.creditsSpent}`);
  }

  // ---------- 3. 局部重绘（蒙版） ----------
  console.log('\n[3] 局部重绘');
  await openTool('inpaint');
  {
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 10 });
    await page.mouse.up();
    ok('已在画布中线上涂抹一笔');

    await page.fill('textarea', '一只橘猫');
    const d = await run(COST.inpaint, '局部重绘');

    const mask = uploads.find((u) => u.kind === 'MASK');
    assert.ok(mask, '提交时没有上传蒙版素材');
    assert.equal(mask.width, SRC.w, `蒙版宽 ${mask.width}，与源图不一致`);
    assert.equal(mask.height, SRC.h, `蒙版高 ${mask.height}，与源图不一致`);

    const { data, info } = await sharp(await imageBytes(mask.url))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = (x, y) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const painted = px(Math.round(SRC.w * 0.5), Math.round(SRC.h * 0.5));
    const untouched = px(12, 12);
    assert.ok(
      painted.every((v) => v > 245),
      `涂过的地方应为白，实为 ${painted}`,
    );
    assert.ok(
      untouched.every((v) => v < 10),
      `没涂的地方应为黑，实为 ${untouched}`,
    );

    const out = await sharp(await imageBytes(d.images[0].url)).metadata();
    assert.equal(out.width, SRC.w, `重绘输出宽 ${out.width}，与蒙版对不上`);
    assert.equal(out.height, SRC.h, `重绘输出高 ${out.height}，与蒙版对不上`);
    ok(`蒙版 ${mask.width}×${mask.height}：涂抹处白、其余黑，输出与蒙版同尺寸`);
    ok(`扣费 ${d.creditsSpent}（基础 2 × 倍率 1.2 → 3）`);
  }

  // ---------- 4. 扩图 ----------
  console.log('\n[4] 智能扩图');
  await openTool('outpaint');
  {
    const handle = await page.locator('[data-handle="e"]').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 150, handle.y + handle.height / 2, {
      steps: 12,
    });
    await page.mouse.up();

    const d = await run(COST.outpaint, '扩图');
    const meta = await sharp(await imageBytes(d.images[0].url)).metadata();
    assert.equal(meta.height, SRC.h, `向右扩图不该改高度，实为 ${meta.height}`);
    assert.ok(
      meta.width > SRC.w + 50,
      `向右拖手柄后画布应变宽，实为 ${SRC.w} → ${meta.width}`,
    );
    ok(`向右拖手柄：${SRC.w}×${SRC.h} → ${meta.width}×${meta.height}，扣费 ${d.creditsSpent}`);
  }

  // ---------- 5. 消除物体 ----------
  console.log('\n[5] 消除物体');
  await openTool('object-removal');
  {
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.6, { steps: 8 });
    await page.mouse.up();

    const d = await run(COST.removeObject, '消除物体');
    const mask = uploads.find((u) => u.kind === 'MASK');
    assert.ok(mask, '提交时没有上传蒙版素材');
    assert.equal(mask.width, SRC.w, `蒙版宽 ${mask.width}`);
    ok(`蒙版已随提交上传，输出 ${d.images[0].width}×${d.images[0].height}，扣费 ${d.creditsSpent}`);
  }

  // ---------- 6. 风格迁移 ----------
  console.log('\n[6] 风格迁移');
  await openTool('style-transfer');
  {
    const inputs = page.locator('input[type=file]');
    assert.equal(await inputs.count(), 2, '风格图槽没渲染出第二个上传入口');
    // 编辑器排在 ToolShell 自己的 input 之前，所以第一个就是风格图槽
    await inputs.first().setInputFiles(STYLE);
    await page.waitForFunction(
      () => document.querySelectorAll('img[src*="/api/files/"]').length >= 2,
      null,
      { timeout: 30000 },
    );

    // 风格图是在 run() 之前传的，而 run() 会清空 uploads 以隔离「本次提交」的上传，
    // 所以这条断言必须放在这里 —— 放到 run() 之后只会读到空数组。
    const styleUploads = uploads.filter((u) => u.kind === 'STYLE_REF');
    assert.equal(styleUploads.length, 1, '风格图没按 STYLE_REF 上传');

    await page.fill('textarea', '厚涂油画质感');
    const d = await run(COST.styleTransfer, '风格迁移');
    assert.equal(
      lastGenBody?.styleAssetId,
      styleUploads[0].assetId,
      '提交体里没有带上风格图的 assetId',
    );
    ok(`风格图已上传并随提交带上，输出 ${d.images[0].width}×${d.images[0].height}，扣费 ${d.creditsSpent}`);
  }

  // ---------- 7. 工具索引 ----------
  console.log('\n[7] 工具索引');
  await page.goto(`${BASE}/zh/tools`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[href*="/tools/"]', { timeout: 30000 });
  const links = await page.locator('a[href*="/tools/"]').count();
  assert.ok(links >= 6, `工具索引只有 ${links} 个入口`);
  ok(`工具索引页列出 ${links} 个入口`);

  // ---------- 8. 控制台 ----------
  console.log('\n[8] 控制台');
  const fatal = consoleErrors.filter(
    (e) => !/favicon|Failed to load resource: the server responded with a status of 404/.test(e),
  );
  assert.equal(fatal.length, 0, '控制台有报错：\n' + fatal.join('\n'));
  ok('浏览器控制台无报错');

  console.log(`\n✅ Phase 4 浏览器验收全部通过（${pass} 项）`);
} catch (err) {
  console.error('\n❌ 验收失败：', err.message);
  if (consoleErrors.length) {
    console.error('   控制台报错：\n' + consoleErrors.slice(0, 10).join('\n'));
  }
  const aside = await page.locator('aside').innerText().catch(() => '');
  if (aside) console.error('   操作栏文案：' + aside.replace(/\s+/g, ' '));
  await page.screenshot({ path: '.data/phase4-fail.png', fullPage: true }).catch(() => {});
  console.error('   截图：.data/phase4-fail.png');
  process.exitCode = 1;
} finally {
  await browser.close();
}
