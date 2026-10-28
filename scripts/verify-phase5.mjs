/**
 * Phase 5 浏览器验收 —— 探索广场 + 账号中心 + sitemap。
 *
 * 覆盖方案里的四条验收标准：
 *   1. 种 12 条探索内容 → 双语都渲染且标题本地化
 *   2. 详情页「一键同款」能复现参数（断言落到草稿的字段上，不是断言按钮点得动）
 *   3. 账号页流水含 HOLD / REFUND / DAILY_GRANT 各类型
 *   4. sitemap.xml 里 /zh/explore 和 /en/explore 都在且 hreflang 正确
 *
 * 「标题本地化」按渲染后的文本断言：双语 map 会随 RSC 载荷一起进 HTML，
 * 拿 page.content() 去查 'Highland Dawn' 一定命中，那样测的是载荷不是界面。
 *
 * REFUND 是唯一需要外力的类型：本地 mock 用 MOCK_FAILURE_RATE 控制失败率，
 * 而它只在进程启动时读一次。所以脚本会额外拉起一个注入了失败率的 dev 实例
 * （端口 3100 + 独立的 .next-verify，两个实例共用 .next 会互相踩编译产物）。
 *
 * 用法：node scripts/verify-phase5.mjs   （需先 pnpm dev）
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
/** 注入 MOCK_FAILURE_RATE=1 的第二个实例，只为跑出 REFUND 这一种流水 */
const FAIL_BASE = 'http://localhost:3100';

/**
 * 每轮开新账号：新账号流水干净，HOLD/SETTLE/GRANT 的出现顺序完全可预期，
 * 断言不必去猜历史遗留。注册送 30 + 每日 20，本轮只花 2 积分。
 */
const EMAIL = `phase5-verify-${Date.now()}@example.test`;
const PASSWORD = 'phase5_verify_pw';

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

// ───────────────────────── 失败注入实例 ─────────────────────────

let failServer = null;

async function startFailServer() {
  console.log('\n[0] 拉起失败注入实例 :3100');
  failServer = spawn('pnpm', ['dev', '-p', '3100'], {
    env: {
      ...process.env,
      NEXT_DIST_DIR: '.next-verify',
      MOCK_FAILURE_RATE: '1',
      MOCK_LATENCY_MS: '0',
    },
    shell: true,
    stdio: 'ignore',
  });

  await waitFor(
    async () => {
      try {
        const r = await fetch(`${FAIL_BASE}/api/health`);
        return r.ok;
      } catch {
        return false;
      }
    },
    180_000,
    ':3100 启动（首次编译要等一会儿）',
  );
  ok('注入失败的实例已就绪');
}

function stopFailServer() {
  if (!failServer) return;
  // Windows 上 pnpm 会派生子进程，杀整棵树，否则 3100 会一直占着
  spawn('taskkill', ['/PID', String(failServer.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  failServer = null;
}

// ───────────────────────── 浏览器 ─────────────────────────

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 200)));

/** RSC 载荷里也有数据，别用 page.content() 做文本断言 */
const visibleText = async (sel) => (await page.locator(sel).allInnerTexts()).join('\n');

const apiGet = async (path, base = BASE) => {
  const r = await page.request.get(`${base}${path}`);
  assert.ok(r.ok(), `GET ${path} → ${r.status()}`);
  const j = await r.json();
  assert.ok(j.ok, `${path} 返回 ok:false`);
  return j.data;
};

try {
  // ---------- 0. 注册 + 登录 ----------
  console.log('\n[1] 注册并登录');
  const reg = await page.request.post(`${BASE}/api/auth/register`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  assert.ok(reg.ok(), `注册失败 ${reg.status()}: ${await reg.text()}`);

  await page.goto(`${BASE}/zh/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });
  ok(`登录成功 → ${new URL(page.url()).pathname}`);
  consoleErrors.length = 0;

  // ---------- 1. 探索广场：双语 + 标题本地化 ----------
  console.log('\n[2] 探索广场双语渲染');
  const list = await apiGet('/api/explore?limit=48');
  assert.ok(
    list.items.length >= 12,
    `探索内容只有 ${list.items.length} 条，seed 的 12 条没种全`,
  );

  for (const [locale, expectTitle, otherTitle] of [
    ['zh', '高原晨光', 'Highland Dawn'],
    ['en', 'Highland Dawn', '高原晨光'],
  ]) {
    await page.goto(`${BASE}/${locale}/explore`, { waitUntil: 'networkidle' });
    await page.waitForSelector('a[href$="/explore/highland-dawn"]', { timeout: 20_000 });

    const cards = await page.locator(`a[href^="/${locale}/explore/"]`).count();
    assert.equal(cards, list.items.length, `${locale} 渲染了 ${cards} 张卡片，接口有 ${list.items.length} 条`);

    const titles = await visibleText(`a[href^="/${locale}/explore/"]`);
    assert.ok(titles.includes(expectTitle), `${locale} 首屏没看到本地化标题「${expectTitle}」`);
    assert.ok(
      !titles.includes(otherTitle),
      `${locale} 页面上混进了另一种语言的标题「${otherTitle}」`,
    );
    ok(`${locale}：${cards} 张卡片，标题本地化为「${expectTitle}」`);
  }

  // ---------- 2. 筛选 ----------
  console.log('\n[3] 分类与精选筛选');
  await page.goto(`${BASE}/zh/explore`, { waitUntil: 'networkidle' });
  await page.waitForSelector('a[href$="/explore/highland-dawn"]');

  await page.getByRole('tab', { name: /^风景/ }).click();
  await page.waitForTimeout(600);
  {
    const landscape = list.items.filter((p) => p.category === 'landscape');
    const cards = await page.locator('a[href^="/zh/explore/"]').count();
    assert.equal(cards, landscape.length, `分类筛选后 ${cards} 张，应 ${landscape.length} 张`);
    const titles = await visibleText('a[href^="/zh/explore/"]');
    for (const p of landscape) {
      assert.ok(titles.includes(p.titleI18n.zh), `分类筛选漏掉了 ${p.titleI18n.zh}`);
    }
    ok(`分类「风景」筛出 ${cards} 张，与接口一致`);
  }

  // 先切回「全部」：分类与精选是叠加条件，带着「风景」去点精选只会剩 1 张
  await page.getByRole('tab', { name: '全部', exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /精选/ }).click();
  await page.waitForTimeout(600);
  {
    const featured = await apiGet('/api/explore?featured=1&limit=48');
    const cards = await page.locator('a[href^="/zh/explore/"]').count();
    assert.equal(cards, featured.items.length, `精选筛选后 ${cards} 张，应 ${featured.items.length} 张`);
    ok(`精选筛出 ${cards} 张，与接口一致`);
  }

  // ---------- 3. 详情页一键同款 ----------
  console.log('\n[4] 详情页一键同款');
  const post = await apiGet('/api/explore/highland-dawn');

  for (const [locale, expectTitle] of [
    ['zh', post.titleI18n.zh],
    ['en', post.titleI18n.en],
  ]) {
    await page.goto(`${BASE}/${locale}/explore/highland-dawn`, { waitUntil: 'networkidle' });
    const h1 = await page.locator('h1').innerText();
    assert.equal(h1.trim(), expectTitle, `${locale} 详情页标题是「${h1}」`);
    ok(`${locale} 详情页标题「${expectTitle}」`);
  }

  await page.goto(`${BASE}/zh/explore/highland-dawn`, { waitUntil: 'networkidle' });
  // 浏览量 +1 是详情页挂载时打的，顺带确认它真的写进去了。
  // ★ 轮询而不是固定 sleep：打完的时机取决于水合，固定 500ms 会偶发失败
  let afterView = await apiGet('/api/explore/highland-dawn');
  for (let i = 0; i < 20 && afterView.viewCount <= post.viewCount; i++) {
    await page.waitForTimeout(500);
    afterView = await apiGet('/api/explore/highland-dawn');
  }
  assert.ok(
    afterView.viewCount > post.viewCount,
    `浏览数没有增长：${post.viewCount} → ${afterView.viewCount}`,
  );

  // 先把草稿清干净，否则读到的可能是上一轮遗留
  await page.evaluate(() => localStorage.removeItem('pure.generator.draft'));
  await page.getByRole('button', { name: /一键同款/ }).click();
  await page.waitForURL((u) => u.pathname.endsWith('/generate'), { timeout: 20_000 });
  await page.waitForTimeout(1000);

  const raw = await page.evaluate(() => localStorage.getItem('pure.generator.draft'));
  assert.ok(raw, '点了一键同款，草稿却没写进 localStorage');
  const draft = JSON.parse(raw).state;

  // 逐字段比对，而不是只断言「提示词对上了」——同款的关键恰恰是种子和比例
  assert.equal(draft.prompt, post.prompt, '草稿提示词与作品不一致');
  assert.equal(draft.modelId, post.modelId, '草稿模型与作品不一致');
  assert.equal(draft.aspectRatio, post.params.aspectRatio, '草稿宽高比与作品不一致');
  assert.equal(draft.seed, post.params.seed, '草稿种子与作品不一致');
  assert.equal(draft.seedLocked, true, '种子没锁住，同款会出另一张图');
  assert.equal(draft.guidance, post.params.guidance, '草稿引导强度与作品不一致');
  ok(
    `同款参数已回填：${draft.modelId} · ${draft.aspectRatio} · seed ${draft.seed}（已锁定）· CFG ${draft.guidance}`,
  );

  // ---------- 4. 账号中心：流水类型 ----------
  console.log('\n[5] 账号中心流水');
  // 先走一次真实生成，才可能同时看到 HOLD 与 SETTLE
  const genRes = await page.request.post(`${BASE}/api/generate`, {
    data: {
      modelId: 'mock-flash',
      mode: 'textToImage',
      prompt: '验收用：一张安静的湖面',
      aspectRatio: '1:1',
      resolution: '1K',
      batchCount: 1,
      idempotencyKey: `phase5-${Date.now()}`,
    },
  });
  assert.ok(genRes.ok(), `提交生成失败 ${genRes.status()}: ${await genRes.text()}`);
  const gen = (await genRes.json()).data;

  await waitFor(
    async () => {
      const g = await apiGet(`/api/generations/${gen.generationId}`);
      return ['SUCCEEDED', 'PARTIAL', 'FAILED'].includes(g.status);
    },
    120_000,
    '生成完成',
  );

  const ledger = await apiGet('/api/me/credits/ledger?limit=50');
  const kinds = new Set(ledger.items.map((r) => r.kind));
  for (const k of ['SIGNUP_BONUS', 'DAILY_GRANT', 'GENERATION_HOLD', 'GENERATION_SETTLE']) {
    assert.ok(kinds.has(k), `流水里没有 ${k}，只有：${[...kinds].join(', ')}`);
  }
  ok(`流水含 ${[...kinds].join(' / ')}`);

  await page.goto(`${BASE}/zh/account/credits`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const ledgerText = await visibleText('ul');
  for (const label of ['注册赠送', '每日额度', '生成预扣', '生成结算']) {
    assert.ok(ledgerText.includes(label), `账号页流水没渲染「${label}」`);
  }
  ok('账号页把四类流水都渲染出来了');

  // 概览页也应该能看到余额与最近流水
  await page.goto(`${BASE}/zh/account`, { waitUntil: 'networkidle' });
  const overview = await page.locator('body').innerText();
  assert.ok(/积分余额|余额/.test(overview), '概览页没有余额卡片');
  ok('概览页正常');

  // ---------- 5. REFUND：需要一个会失败的实例 ----------
  console.log('\n[6] 失败退款流水');
  await startFailServer();

  const failCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const failPage = await failCtx.newPage();
  await failPage.goto(`${FAIL_BASE}/zh/login`, { waitUntil: 'networkidle' });
  await failPage.waitForTimeout(800);
  await failPage.fill('input[type="email"]', EMAIL);
  await failPage.fill('input[type="password"]', PASSWORD);
  await failPage.click('button[type="submit"]');
  await failPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });

  const meBefore = await (await failPage.request.get(`${FAIL_BASE}/api/me`)).json();
  const balanceBefore = meBefore.data.creditBalance;

  const failRes = await failPage.request.post(`${FAIL_BASE}/api/generate`, {
    data: {
      modelId: 'mock-flash',
      mode: 'textToImage',
      prompt: '验收用：这一张注定失败',
      aspectRatio: '1:1',
      resolution: '1K',
      batchCount: 2,
      idempotencyKey: `phase5-fail-${Date.now()}`,
    },
  });
  assert.ok(failRes.ok(), `提交失败用例出错 ${failRes.status()}: ${await failRes.text()}`);
  const failGen = (await failRes.json()).data;

  let failStatus = null;
  await waitFor(
    async () => {
      const r = await failPage.request.get(`${FAIL_BASE}/api/generations/${failGen.generationId}`);
      const j = await r.json();
      failStatus = j.data?.status ?? null;
      return ['FAILED', 'PARTIAL', 'SUCCEEDED'].includes(failStatus);
    },
    120_000,
    '失败用例结算',
  );

  const failLedger = await (
    await failPage.request.get(`${FAIL_BASE}/api/me/credits/ledger?limit=20`)
  ).json();
  const refunds = failLedger.data.items.filter((r) => r.kind === 'GENERATION_REFUND');

  // ★ 这条任务有两个 worker 在抢（:3000 和注入实例共用一张任务表，先轮询到的先领）。
  //   主实例抢到就会正常出图、不会退款 —— 那是合法结果，不是缺陷。所以这里断言的是
  //   「结果与流水自洽」，而 REFUND 本身的确定性验证放在 phase2 的 fail 通道
  //   （单实例 + MOCK_FAILURE_RATE=1，必然失败）。
  if (failStatus === 'SUCCEEDED') {
    ok('注入实例的 worker 没抢到，任务被主实例正常出图 —— 跳过退款断言（见 phase2 fail 通道）');
  } else {
    assert.ok(refunds.length > 0, `失败后没有退款流水（终态 ${failStatus}）`);
    ok(`失败后写了退款流水 —— ${failStatus}，REFUND ${refunds.length} 条`);
  }
  const refunded = refunds.reduce((n, r) => n + r.delta, 0);
  assert.equal(refunded, failGen.creditsHeld, `退款 ${refunded} 与预扣 ${failGen.creditsHeld} 不等`);

  const meAfter = await (await failPage.request.get(`${FAIL_BASE}/api/me`)).json();
  assert.equal(
    meAfter.data.creditBalance,
    balanceBefore,
    `退款后余额 ${meAfter.data.creditBalance} 没回到 ${balanceBefore}`,
  );
  ok(`生成失败 → HOLD -${failGen.creditsHeld} + REFUND +${refunded}，余额复原为 ${balanceBefore}`);

  await failPage.goto(`${FAIL_BASE}/zh/account/credits`, { waitUntil: 'networkidle' });
  await failPage.waitForTimeout(1200);
  const failLedgerText = (await failPage.locator('ul').allInnerTexts()).join('\n');
  assert.ok(failLedgerText.includes('失败退款'), '账号页没把退款那一行渲染出来');
  ok('账号页渲染出「失败退款」');
  await failCtx.close();
  stopFailServer();

  // ---------- 6. sitemap / robots ----------
  console.log('\n[7] sitemap 与 robots');
  const sm = await page.request.get(`${BASE}/sitemap.xml`);
  assert.ok(sm.ok(), `/sitemap.xml → ${sm.status()}`);
  const xml = await sm.text();

  for (const locale of ['zh', 'en']) {
    const url = `${BASE}/${locale}/explore`;
    // 取包含该 loc 的那个 <url> 块，块内必须同时有 zh 与 en 的交替链接
    const block = xml
      .split('<url>')
      .find((b) => b.includes(`<loc>${url}</loc>`));
    assert.ok(block, `sitemap 里没有 ${url}`);
    for (const alt of ['zh', 'en']) {
      const expected = `${BASE}/${alt}/explore`;
      assert.ok(
        block.includes(`hreflang="${alt}" href="${expected}"`),
        `${url} 的 hreflang ${alt} 指向不对，块内容：${block.replace(/\s+/g, ' ').slice(0, 200)}`,
      );
    }
  }
  ok('/zh/explore 与 /en/explore 均在 sitemap 中，且 hreflang 指向正确');

  const postBlock = xml.split('<url>').find((b) => b.includes('<loc>' + `${BASE}/zh/explore/highland-dawn` + '</loc>'));
  assert.ok(postBlock, 'sitemap 里没有作品详情页');
  ok('作品详情页也进了 sitemap');

  const robots = await (await page.request.get(`${BASE}/robots.txt`)).text();
  assert.ok(robots.includes(`Sitemap: ${BASE}/sitemap.xml`), 'robots.txt 没指向 sitemap');
  assert.ok(/Disallow: \/\*\/account/.test(robots), 'robots.txt 没有屏蔽账户区');
  ok('robots.txt 指向 sitemap 且屏蔽了账户区');

  // ---------- 7. 控制台 ----------
  console.log('\n[8] 控制台');
  const fatal = consoleErrors.filter(
    (e) => !/favicon|Failed to load resource: the server responded with a status of 404/.test(e),
  );
  assert.equal(fatal.length, 0, '控制台有报错：\n' + fatal.join('\n'));
  ok('浏览器控制台无报错');

  console.log(`\n✅ Phase 5 浏览器验收全部通过（${pass} 项）`);
} catch (err) {
  console.error('\n❌ 验收失败：', err.message);
  if (consoleErrors.length) {
    console.error('   控制台报错：\n' + consoleErrors.slice(0, 10).join('\n'));
  }
  await page.screenshot({ path: '.data/phase5-fail.png', fullPage: true }).catch(() => {});
  console.error('   截图：.data/phase5-fail.png');
  process.exitCode = 1;
} finally {
  stopFailServer();
  await browser.close();
}
