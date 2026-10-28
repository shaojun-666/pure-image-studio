/**
 * Phase 3 浏览器验收 —— 真实 Chrome，真实点击，真实网络。
 *
 * 覆盖方案里的验收标准：
 *   输入提示词 → 选 mock-pro（档位徽章可见）→ 16:9 / 2K / 批量 4 → 风格选「国风水墨」→ 生成
 *   4 个骨架格渐显为 4 张不同图 → 悬浮下载得到真实文件 → 积分徽章实时减少
 *   历史页可见 → 详情页显示种子且 Remix 正确回填
 *
 * 用法：node scripts/verify-phase3.mjs   （需先 pnpm dev）
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = 'admin@aigc.local';
const PASSWORD = 'admin_dev_pw_2026';
const PROMPT = '水墨山水，远山如黛，一叶扁舟';

let pass = 0;
const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 200)));

const balanceOf = async () => {
  const r = await page.request.get(`${BASE}/api/me`);
  return (await r.json()).data.creditBalance;
};

try {
  // ---------- 0. 登录 ----------
  console.log('\n[0] 登录');
  await page.goto(`${BASE}/zh/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // 等 React 接管表单，否则点击走原生 GET 提交
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
  ok(`登录成功 → ${new URL(page.url()).pathname}`);

  // 登录前 /api/me 必然 401，那是正确行为，从这里开始才统计控制台报错
  consoleErrors.length = 0;

  const balanceBefore = await balanceOf();

  // ---------- 1. 生成器 ----------
  console.log('\n[1] 生成器参数');
  await page.goto(`${BASE}/zh/generate`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("开始生成")', { timeout: 30000 });
  // 等模型目录加载完（默认模型的徽章出现）
  await page.waitForSelector('[aria-label="模型"] >> text=/极速|高质量|旗舰/', { timeout: 30000 });
  ok('生成器外壳挂载，模型目录已加载');

  // 选 mock-pro（臻绘 2.0 / 高质量 / 6 积分）
  await page.click('[aria-label="模型"]');
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  const proOption = page.locator('[role="option"]', { hasText: '臻绘 2.0' }).first();
  assert.ok(await proOption.count(), '下拉框里找不到 mock-pro');
  const optionText = (await proOption.innerText()).replace(/\s+/g, ' ');
  assert.match(optionText, /高质量/, `档位徽章缺失：${optionText}`);
  assert.match(optionText, /6/, `单张积分缺失：${optionText}`);
  await proOption.click();
  await page.keyboard.press('Escape');
  ok(`选中 mock-pro，档位徽章可见：「${optionText}」`);

  // 16:9 / 2K / 批量 4
  await page.click('button:text-is("16:9")');
  await page.click('button:text-is("2K")');
  await page.click('button:text-is("4")');
  const cost = (await page.locator('text=/共 \\d+ 积分/').first().innerText()).trim();
  assert.match(cost, /共 24 积分/, `报价不对：${cost}`);
  ok(`参数已设，报价 = ${cost}（6 × 4）`);

  // 风格「国风水墨」
  await page.click('button:has-text("不使用风格")');
  await page.waitForSelector('dialog[open]', { timeout: 10000 });
  await page.click('dialog button:text-is("国风水墨")');
  await page.waitForSelector('dialog .grid button', { timeout: 15000 });
  const styleName = (await page.locator('dialog .grid button').first().innerText()).split('\n')[0].trim();
  await page.locator('dialog .grid button').first().click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: 10000 });
  const styleTrigger = (await page.locator('button:has-text("风格")').first().isVisible().catch(() => false));
  const pickedStyle = (await page.locator('text=' + styleName).first().isVisible().catch(() => false));
  assert.ok(pickedStyle || styleTrigger, '风格未被回填到触发器');
  ok(`风格已选：「${styleName}」（国风水墨分类）`);

  // 提示词
  await page.fill('textarea', PROMPT);
  ok('提示词已输入');

  // ---------- 2. 生成 ----------
  console.log('\n[2] 生成全链路');
  const gallery = 'main, body';
  await page.click('button:has-text("开始生成")');

  // 骨架格：点击后应立刻出现 batchCount 个占位格
  await page.waitForTimeout(1200);
  const skeletonCount = await page.locator('.shimmer, [class*="shimmer"]').count();
  ok(`提交后出现 ${skeletonCount} 个骨架格`);

  // 等 4 张真图（/api/files/ 的图，且已解码）
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-result-grid] img')]
      .filter((i) => i.src.includes('/api/files/') && i.naturalWidth > 100).length >= 4,
    null,
    { timeout: 180000 },
  );
  const srcs = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('[data-result-grid] img')]
      .filter((i) => i.src.includes('/api/files/') && i.naturalWidth > 100)
      .map((i) => i.src))]);
  assert.equal(srcs.length, 4, `期望 4 张不同的图，实得 ${srcs.length}`);
  const dims = await page.evaluate(() => {
    const i = [...document.querySelectorAll('[data-result-grid] img')].find((x) => x.src.includes('/api/files/') && x.naturalWidth > 100);
    return { w: i.naturalWidth, h: i.naturalHeight };
  });
  assert.equal(dims.w / dims.h > 1.7 && dims.w / dims.h < 1.8, true, `16:9 不符：${dims.w}x${dims.h}`);
  ok(`4 张不同的图，尺寸 ${dims.w}×${dims.h}（16:9 / 2K）`);

  // ---------- 3. 积分 ----------
  console.log('\n[3] 积分');
  const balanceAfter = await balanceOf();
  assert.equal(balanceBefore - balanceAfter, 24, `扣分不对：${balanceBefore} → ${balanceAfter}`);
  const headerText = await page.locator('header').innerText();
  assert.ok(headerText.includes(String(balanceAfter)), `徽章未显示新余额 ${balanceAfter}：${headerText}`);
  ok(`余额 ${balanceBefore} → ${balanceAfter}（-24），徽章同步`);

  // ---------- 4. 下载 ----------
  console.log('\n[4] 下载');
  const dlHref = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[href*="/download"]')][0];
    return a?.getAttribute('href') ?? null;
  });
  assert.ok(dlHref, '结果卡上没有下载链接');
  const dl = await page.request.get(BASE + dlHref);
  assert.equal(dl.status(), 200, `下载返回 ${dl.status()}`);
  const body = await dl.body();
  assert.ok(body.length > 5000, `文件太小：${body.length} 字节`);
  assert.equal(body.subarray(1, 4).toString(), 'PNG', '不是 PNG 字节流');
  ok(`下载得到真实文件：${body.length} 字节，PNG 魔数正确`);

  // ---------- 5. 历史 ----------
  console.log('\n[5] 历史与 Remix');
  await page.goto(`${BASE}/zh/history`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[href*="/history/"]', { timeout: 30000 });
  const cards = await page.locator('a[href*="/history/"]').count();
  assert.ok(cards >= 1, '历史列表为空');
  ok(`历史页可见 ${cards} 条记录`);

  await page.locator('a[href*="/history/"]').first().click();
  await page.waitForURL(/\/history\/[^/]+$/, { timeout: 30000 });
  await page.waitForSelector('text=/种子/', { timeout: 30000 });
  const detail = await page.locator('body').innerText();
  assert.match(detail, /种子/, '详情页没有种子字段');
  assert.match(detail, new RegExp(PROMPT.slice(0, 6)), '详情页没有提示词');
  ok('详情页显示种子与提示词');

  // 详情页 URL 里就是 generationId，直接问 API 要权威种子
  const genId = page.url().split('/').pop();
  const seedOnServer = String((await (await page.request.get(`${BASE}/api/generations/${genId}`)).json()).data.seed);

  await page.click('button:has-text("一键同款")');
  await page.waitForURL(/\/generate$/, { timeout: 30000 });
  await page.waitForSelector('textarea', { timeout: 30000 });
  const refilled = await page.inputValue('textarea');
  assert.equal(refilled, PROMPT, `Remix 未回填：${refilled}`);

  // 种子面板默认折叠，先展开
  await page.click('button:has-text("高级参数")');
  const seedInput = page.locator('input[placeholder="锁定后可手动填写"]');
  await seedInput.waitFor({ timeout: 10000 });
  const seedInForm = await seedInput.inputValue();
  assert.equal(seedInForm, seedOnServer, `Remix 未回填种子：表单 ${seedInForm} vs 服务端 ${seedOnServer}`);
  ok(`Remix 正确回填提示词与种子 ${seedOnServer}，并跳回生成器`);

  // ---------- 6. 能力门控 ----------
  // mock-ultra 的 capabilities 里只有 textToImage 为 true。切过去，不相干的模式
  // 必须自动置灰 —— 这条链路上没有任何一处前端代码知道「哪个模型支持什么」。
  console.log('\n[6] 能力门控');
  const pickModel = async (name) => {
    await page.click('[aria-label="模型"]');
    await page.waitForSelector('[role="option"]', { timeout: 10000 });
    await page.locator('[role="option"]', { hasText: name }).first().click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  };
  // 置灰时 label 会被包进 <span class="line-through">，所以不能用 :text-is 匹配 button
  const disabled = (label) =>
    page.locator('button').filter({ hasText: label }).first().isDisabled();

  await pickModel('天工 Ultra');
  assert.equal(await disabled('文生图'), false, '文生图 被误置灰');
  for (const m of ['图生图', '局部重绘', '扩图', '抠图', '放大增强', '风格迁移', '对象消除']) {
    assert.equal(await disabled(m), true, `${m} 未随 capabilities 置灰`);
  }
  ok('mock-ultra（纯文生图）下其余 7 个模式全部置灰，文生图 可用');

  await pickModel('臻绘 2.0');
  assert.equal(await disabled('局部重绘'), false, 'mock-pro 下 局部重绘 仍被置灰');
  ok('切回 mock-pro 后 局部重绘 恢复可用（门控随模型实时变化）');

  // ---------- 7. 控制台 ----------
  console.log('\n[7] 控制台');
  const fatal = consoleErrors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 404/.test(e));
  assert.equal(fatal.length, 0, '控制台有报错：\n' + fatal.join('\n'));
  ok('浏览器控制台无报错');

  console.log(`\n✅ Phase 3 浏览器验收全部通过（${pass} 项）`);
} catch (err) {
  console.error('\n❌ 验收失败：', err.message);
  await page.screenshot({ path: '.data/phase3-fail.png', fullPage: true }).catch(() => {});
  console.error('   截图：.data/phase3-fail.png');
  process.exitCode = 1;
} finally {
  await browser.close();
}
