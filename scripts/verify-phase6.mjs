/**
 * Phase 6 浏览器验收 —— 后台管理。
 *
 * 严格对应方案里的四条验收标准：
 *   1. 发布草稿 → 数秒后出现在 /explore
 *   2. 关掉 mock-pro → 下拉框消失且用该 id 提交返回 404
 *   3. 给用户发 100 积分 → 余额更新且写入 ADMIN_GRANT + AdminAuditLog
 *   4. 非管理员访问 /api/admin/users 得 403 且 /zh/admin 跳转
 *
 * 两个浏览器上下文各持一份 cookie：普通用户走注册流程，管理员用 seed 账号。
 * 这样「非管理员」这条才是真的用普通身份去撞，而不是伪造请求头。
 *
 * 管理员密码从环境读，不落盘、不打印：
 *   node --env-file=.env scripts/verify-phase6.mjs     （需先 pnpm dev）
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

/** 每轮开新账号：新用户余额干净，发 100 之后就是 30+20+100，不必猜历史 */
const EMAIL = `phase6-verify-${Date.now()}@example.test`;
const PASSWORD = 'phase6_verify_pw';

let pass = 0;
const ok = (m) => {
  pass++;
  console.log(`  ✅ ${m}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await sleep(500);
  }
  throw new Error(`超时：${what}`);
}

/** 读统一响应 `{ ok, data }`，顺带把非 2xx 的正文带出来，否则失败时只剩个状态码 */
async function json(res) {
  const body = await res.json().catch(() => null);
  return { status: res.status(), ok: res.ok(), body, data: body?.data };
}

async function login(page, email, password) {
  await page.goto(`${BASE}/zh/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });
}

// ───────────────────────── 0. 前置 ─────────────────────────

assert.ok(ADMIN_EMAIL && ADMIN_PASSWORD, '缺少 SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD，用 --env-file=.env 跑');

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctxUser = await browser.newContext();
const ctxAdmin = await browser.newContext();
const userPage = await ctxUser.newPage();
const adminPage = await ctxAdmin.newPage();

/**
 * 只记「请求本身出错」的响应，不记 console 里的文字。
 * 浏览器对非 2xx 只会甩一句 Failed to load resource，不带 URL，
 * 拿它当断言就是在一堆没有定位信息的噪音上做判断。
 */
const errors = [];
for (const [tag, p] of [['user', userPage], ['admin', adminPage]]) {
  p.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${tag} ${r.status()} ${r.url().replace(BASE, '')}`);
  });
}

let exploreSlug = null;

try {
  console.log('\n[0] 建号：普通用户 + 管理员');
  const reg = await userPage.request.post(`${BASE}/api/auth/register`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  assert.ok(reg.ok(), `注册失败 ${reg.status()}: ${await reg.text()}`);
  await login(userPage, EMAIL, PASSWORD);
  const me = await json(await userPage.request.get(`${BASE}/api/me`));
  const userId = me.data?.user?.id ?? me.data?.id;
  assert.ok(userId, `拿不到 userId：${JSON.stringify(me.body)?.slice(0, 200)}`);
  ok(`普通用户登录 ${EMAIL} (id=${userId.slice(0, 8)}…)`);

  await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminMe = await json(await adminPage.request.get(`${BASE}/api/me`));
  const adminRole = adminMe.data?.user?.role ?? adminMe.data?.role;
  assert.equal(adminRole, 'ADMIN', `seed 账号不是管理员：${JSON.stringify(adminMe.body)?.slice(0, 200)}`);
  ok('管理员登录，role=ADMIN');

  // ───────────── 验收 4：非管理员 403 + 跳转 ─────────────

  console.log('\n[1] 验收四：非管理员访问后台');
  const forbid = await json(await userPage.request.get(`${BASE}/api/admin/users`));
  assert.equal(forbid.status, 403, `期望 403，实际 ${forbid.status}`);
  ok('GET /api/admin/users → 403');

  await userPage.goto(`${BASE}/zh/admin`, { waitUntil: 'networkidle' });
  await userPage.waitForTimeout(1200);
  const landed = new URL(userPage.url()).pathname;
  assert.ok(!landed.startsWith('/zh/admin'), `期望被弹走，实际停在 ${landed}`);
  ok(`/zh/admin 跳转到 ${landed}`);

  // ───────────── 验收 3：发积分 → ADMIN_GRANT + 审计 ─────────────

  console.log('\n[2] 验收三：发放 100 积分');
  const before = await json(await userPage.request.get(`${BASE}/api/me`));
  const balanceBefore = before.data?.user?.creditBalance ?? before.data?.creditBalance;
  assert.equal(typeof balanceBefore, 'number', '读不到余额');

  const grant = await json(
    await adminPage.request.post(`${BASE}/api/admin/users/${userId}/credits`, {
      data: { amount: 100, reason: 'Phase 6 验收' },
    }),
  );
  assert.ok(grant.ok, `发放失败 ${grant.status}: ${JSON.stringify(grant.body)?.slice(0, 200)}`);
  ok(`POST /api/admin/users/:id/credits → ${grant.status}`);

  const after = await json(await userPage.request.get(`${BASE}/api/me`));
  const balanceAfter = after.data?.user?.creditBalance ?? after.data?.creditBalance;
  assert.equal(balanceAfter - balanceBefore, 100, `余额差 ${balanceAfter - balanceBefore}`);
  ok(`余额 ${balanceBefore} → ${balanceAfter}`);

  const ledger = await json(await userPage.request.get(`${BASE}/api/me/credits/ledger?limit=20`));
  const entries = ledger.data?.items ?? ledger.data ?? [];
  const grantRow = entries.find((e) => e.kind === 'ADMIN_GRANT' && e.delta === 100);
  assert.ok(
    grantRow,
    `流水里没有 ADMIN_GRANT +100：${JSON.stringify(entries.map((e) => `${e.kind}${e.delta}`))}`,
  );
  ok('用户流水出现 ADMIN_GRANT +100');

  const stats = await json(await adminPage.request.get(`${BASE}/api/admin/stats`));
  const auditHit = (stats.data?.audit ?? []).find(
    (a) => a.action === 'user.grantCredits' && a.targetId === userId,
  );
  assert.ok(
    auditHit,
    `审计日志里没有 user.grantCredits → ${userId}：${JSON.stringify((stats.data?.audit ?? []).map((a) => a.action))}`,
  );
  ok(`审计日志写入 user.grantCredits（${auditHit.targetType}）`);

  // ───────────── 验收 2：关模型 → 下拉消失 + 提交 404 ─────────────

  console.log('\n[3] 验收二：下架 mock-pro');
  const modelsBefore = await json(await adminPage.request.get(`${BASE}/api/models`));
  assert.ok(
    (modelsBefore.data ?? []).some((m) => m.id === 'mock-pro'),
    '前置条件不成立：mock-pro 本来就不在目录里',
  );

  const off = await json(
    await adminPage.request.patch(`${BASE}/api/admin/models`, {
      data: { id: 'mock-pro', enabled: false },
    }),
  );
  assert.ok(off.ok, `下架失败 ${off.status}: ${JSON.stringify(off.body)?.slice(0, 200)}`);

  const modelsOff = await json(await userPage.request.get(`${BASE}/api/models`));
  assert.ok(
    !(modelsOff.data ?? []).some((m) => m.id === 'mock-pro'),
    'mock-pro 仍出现在 /api/models',
  );
  ok('下架后 /api/models 不再返回 mock-pro');

  const rejected = await json(
    await userPage.request.post(`${BASE}/api/generate`, {
      data: {
        modelId: 'mock-pro',
        mode: 'textToImage',
        prompt: '下架的模型不该能提交',
        negativePrompt: '',
        aspectRatio: '1:1',
        resolution: '1K',
        batchCount: 1,
        idempotencyKey: randomUUID(),
      },
    }),
  );
  assert.equal(rejected.status, 404, `期望 404，实际 ${rejected.status} ${JSON.stringify(rejected.body)?.slice(0, 200)}`);
  ok('用下架 id 提交 → 404');

  // 收尾复原：验收不该把环境改成下一个人看不懂的样子
  const back = await json(
    await adminPage.request.patch(`${BASE}/api/admin/models`, {
      data: { id: 'mock-pro', enabled: true },
    }),
  );
  assert.ok(back.ok, '复原 mock-pro 失败');
  const modelsBack = await json(await adminPage.request.get(`${BASE}/api/models`));
  assert.ok(
    (modelsBack.data ?? []).some((m) => m.id === 'mock-pro'),
    '复原后 mock-pro 没回来',
  );
  ok('恢复 mock-pro 上架');

  // ───────────── 验收 1：发布草稿 → 出现在 /explore ─────────────

  console.log('\n[4] 验收一：草稿发布数秒后出现在 /explore');
  exploreSlug = `phase6-verify-${Date.now()}`;
  const titleZh = `Phase6 验收作品 ${exploreSlug.slice(-6)}`;
  const titleEn = `Phase6 Verify ${exploreSlug.slice(-6)}`;

  const created = await json(
    await adminPage.request.post(`${BASE}/api/admin/explore`, {
      data: {
        slug: exploreSlug,
        titleI18n: { zh: titleZh, en: titleEn },
        coverKey: 'public/explore/highland-dawn.webp',
        prompt: '后台验收用的草稿，测完会删掉',
        params: { aspectRatio: '1:1', resolution: '1K' },
        tags: ['verify'],
        sortOrder: -1,
        status: 'DRAFT',
      },
    }),
  );
  assert.ok(created.ok, `建草稿失败 ${created.status}: ${JSON.stringify(created.body)?.slice(0, 300)}`);
  ok(`建草稿 ${exploreSlug}`);

  const pubBefore = await json(await userPage.request.get(`${BASE}/api/explore?limit=48`));
  assert.ok(
    !(pubBefore.data?.items ?? []).some((p) => p.slug === exploreSlug),
    '草稿不该出现在公开接口里',
  );
  ok('草稿不出现在 /api/explore');

  // 后台列表里必须看得见草稿，否则「发布草稿」这个动作无从谈起
  const adminList = await json(await adminPage.request.get(`${BASE}/api/admin/explore?status=DRAFT`));
  assert.ok(
    (adminList.data?.items ?? []).some((p) => p.slug === exploreSlug),
    '后台列表里看不到刚建的草稿',
  );
  ok('后台列表可见草稿');

  const createdId = created.data?.id;
  const published = await json(
    await adminPage.request.patch(`${BASE}/api/admin/explore/${createdId}`, {
      data: { status: 'PUBLISHED' },
    }),
  );
  assert.ok(published.ok, `发布失败 ${published.status}: ${JSON.stringify(published.body)?.slice(0, 300)}`);
  ok('PATCH status=PUBLISHED');

  const appeared = await waitFor(
    async () => {
      const r = await json(await userPage.request.get(`${BASE}/api/explore?limit=48`));
      return (r.data?.items ?? []).some((p) => p.slug === exploreSlug);
    },
    10_000,
    '发布后 10 秒内没出现在 /api/explore',
  ).catch(() => false);
  assert.ok(appeared, '发布后 10 秒内没出现在 /api/explore');
  ok('数秒内出现在 /api/explore');

  // 页面上还要看得见，且标题走本地化：英文界面必须出英文标题
  await userPage.goto(`${BASE}/zh/explore`, { waitUntil: 'networkidle' });
  await userPage.waitForTimeout(600);
  const zhText = (await userPage.locator('body').allInnerTexts()).join('\n');
  assert.ok(zhText.includes(titleZh), '中文界面没渲染出该作品的标题');
  ok('中文 /zh/explore 渲染出该作品');

  await userPage.goto(`${BASE}/en/explore`, { waitUntil: 'networkidle' });
  await userPage.waitForTimeout(600);
  const enText = (await userPage.locator('body').allInnerTexts()).join('\n');
  assert.ok(enText.includes(titleEn), '英文界面没渲染出英文标题');
  assert.ok(!enText.includes(titleZh), '英文界面漏出了中文标题');
  ok('英文 /en/explore 渲染英文标题');

  // ───────────── 收尾：删掉验收数据 ─────────────

  console.log('\n[5] 收尾');
  const del = await json(
    await adminPage.request.delete(`${BASE}/api/admin/explore/${createdId}`),
  );
  assert.ok(del.ok, `删除失败 ${del.status}`);
  const gone = await json(await userPage.request.get(`${BASE}/api/explore?limit=48`));
  assert.ok(!(gone.data?.items ?? []).some((p) => p.slug === exploreSlug), '删除后仍在公开列表');
  ok('删除验收作品，公开列表同步消失');

  // 唯一的白名单：未登录时站头问 /api/me 拿身份，拿到 401 是正确行为。
  // 这是在给「预期内的 401」开豁免，不是给失败擦地——出现别的任何 4xx/5xx 都会让这行红。
  const unexpected = errors.filter((e) => !/ 401 \/api\/me$/.test(e));
  assert.equal(unexpected.length, 0, `非预期请求失败：\n${unexpected.join('\n')}`);

  console.log(`\n✅ Phase 6 验收通过（${pass} 项断言）`);
} catch (err) {
  console.error(`\n❌ 失败：${err.message}`);
  if (exploreSlug) console.error(`   遗留验收数据 slug=${exploreSlug}（可手动删）`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
