/**
 * 部署验收：整套编排（nginx → app → db + cron）真的能跑。
 *
 * 只断言「真部署起来才成立」的事，不看「文件写没写」：
 *   · 经 nginx 的健康检查、页面渲染、出图全链路
 *   · SSE 是逐条推的，不是攒到最后一次性刷出来（缓冲了 Nginx 配置就是废的）
 *   · 生成途中重启 app：nginx 不 502（上游地址要跟着重新解析），任务被 reaper 接管并收敛
 *   · cron：备份产物非空、恢复演练通过、对账端点认密钥
 *
 * 用法：node scripts/verify-deploy.mjs          （需先起好 compose 栈）
 *      BASE_URL=http://localhost:8080 COMPOSE_ENV=.data/compose.env
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const COMPOSE_ENV = process.env.COMPOSE_ENV ?? '.data/compose.env';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const EMAIL = `deploy-${Date.now()}@example.test`;
const PASSWORD = 'deploy_verify_pw';

const dc = (...args) =>
  execFileSync(
    'docker',
    ['compose', '--env-file', COMPOSE_ENV, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

let pass = 0;
const ok = (m) => {
  pass++;
  console.log(`  ✅ ${m}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 带上登录态订阅 SSE，记录每个事件到达的时刻 —— 时刻才是判断有没有被缓冲的依据 */
async function readSse(page, id, timeoutMs = 60_000) {
  const cookies = await page.context().cookies();
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await fetch(`${BASE}/api/generations/${id}/events`, {
    headers: { cookie, accept: 'text/event-stream' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert.equal(res.status, 200, `SSE 没连上：HTTP ${res.status}`);

  const events = [];
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    const t = Date.now();
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const name = /^event:\s*(\S+)/m.exec(raw)?.[1] ?? 'message';
      events.push({ name, t, raw });
    }
  }
  return events;
}

async function submit(page, body) {
  const res = await page.request.post(`${BASE}/api/generate`, {
    data: { idempotencyKey: crypto.randomUUID(), ...body },
  });
  const json = await res.json();
  assert.ok(json.ok, `提交失败：${JSON.stringify(json).slice(0, 200)}`);
  return json.data.generationId;
}

async function waitTerminal(page, id, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await page.request.get(`${BASE}/api/generations/${id}`);
    const g = (await r.json()).data;
    if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED'].includes(g.status)) return g;
    await sleep(1200);
  }
  throw new Error(`任务 ${id.slice(0, 8)} 在 ${timeoutMs / 1000}s 内没收敛（reaper 没接管？）`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const bad = [];
page.on('response', (r) => {
  // 游客态下 /api/me 返回 401 是正常的（白名单，不是掩盖）
  if (r.status() >= 400 && !r.url().includes('/api/me')) {
    bad.push(`${r.status()} ${r.url().replace(BASE, '')}`);
  }
});

try {
  console.log('\n[1] 经 nginx 的健康检查');
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(health.data.db, 'up', `健康检查没过：${JSON.stringify(health)}`);
  ok(`/api/health 通（db 往返 ${health.data.dbLatencyMs}ms，uptime ${health.data.uptimeSec}s）`);

  console.log('\n[2] 页面在容器化构建里能渲染');
  await page.goto(`${BASE}/zh/generate`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '文生图' }).first().waitFor({ timeout: 30_000 });
  ok('/zh/generate 渲染出模式 Tab（SSR + 水合正常）');
  await page.goto(`${BASE}/zh`, { waitUntil: 'domcontentloaded' });
  // 不用 networkidle：生成器/首页有常驻请求，永远等不到「无网络活动」，会白等满 30s
  await page.locator('h1').first().waitFor({ timeout: 30_000 });
  const hero = (await page.locator('h1').allInnerTexts()).join(' ').trim();
  assert.ok(hero.length > 0, '首页 h1 是空的');
  ok(`/zh 首页渲染：${hero.slice(0, 24)}`);

  console.log('\n[3] 注册 → 出图 → 图片经 nginx 可取');
  const reg = await page.request.post(`${BASE}/api/auth/register`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  assert.ok(reg.ok(), `注册失败 HTTP ${reg.status()}`);
  await page.goto(`${BASE}/zh/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });
  ok('注册并登录');

  const models = (await (await page.request.get(`${BASE}/api/models`)).json()).data;
  const model = models.find((m) => m.capabilities.modes.textToImage) ?? models[0];
  const id = await submit(page, {
    modelId: model.id,
    mode: 'textToImage',
    prompt: '部署验收：一只橘猫',
    aspectRatio: '1:1',
    resolution: '1K',
    batchCount: 4,
  });
  ok(`提交成功 model=${model.id} id=${id.slice(0, 8)}…`);

  const events = await readSse(page, id);
  const times = events.map((e) => e.t);
  const imageEvents = events.filter((e) => e.name === 'image');
  const spread = Math.max(...times) - Math.min(...times);
  assert.ok(events.length >= 2, `SSE 只推了 ${events.length} 个事件`);
  assert.ok(imageEvents.length >= 1, `SSE 里没有 image 事件：${events.map((e) => e.name).join(',')}`);
  // ★ 被缓冲的话所有事件会在同一瞬间到达（spread≈0），进度条就变成「转半天再一次性完成」
  assert.ok(spread > 500, `事件几乎同时到达（spread=${spread}ms）—— SSE 被 Nginx 缓冲了`);
  ok(`SSE 逐条推送：${events.length} 个事件，跨度 ${spread}ms，图片 ${imageEvents.length} 张`);

  const done = await waitTerminal(page, id, 90_000);
  assert.ok(done.succeededCount > 0, `一张都没出：${done.status}`);
  const detail = (await (await page.request.get(`${BASE}/api/generations/${id}`)).json()).data;
  const img = await fetch(`${BASE}${detail.images[0].url}`);
  assert.equal(img.status, 200, `图片取不到：HTTP ${img.status}`);
  assert.match(img.headers.get('content-type') ?? '', /^image\//, '取回来的不是图片');
  ok(`出图 ${done.succeededCount}/4，图片经 nginx 可取（${img.headers.get('content-type')}）`);

  console.log('\n[4] 生成途中重启 app');
  const id2 = await submit(page, {
    modelId: model.id,
    mode: 'textToImage',
    prompt: '重启恢复验收',
    aspectRatio: '1:1',
    resolution: '1K',
    batchCount: 8,
  });
  await sleep(1500); // 让 worker 领到任务，制造「跑到一半被打断」
  dc('restart', 'app');
  await sleep(5000);

  const h2 = await fetch(`${BASE}/api/health`);
  assert.equal(
    h2.status,
    200,
    'app 重启后 nginx 502 —— 上游地址没跟着重新解析（resolver + 变量那套失效了）',
  );
  ok('重启后 nginx 立刻恢复路由');

  // 租约到期（本地验收把 LEASE_TTL_MS 调小了）后任务会被重新领取
  const recovered = await waitTerminal(page, id2, 180_000);
  assert.ok(
    ['SUCCEEDED', 'PARTIAL', 'FAILED'].includes(recovered.status),
    `任务没收敛：${recovered.status}`,
  );
  ok(`被中断的任务已接管收敛：${recovered.status}（成功 ${recovered.succeededCount}/${recovered.batchCount}）`);

  console.log('\n[5] cron：备份 / 恢复演练 / 对账');
  dc('exec', '-T', 'cron', '/scripts/backup.sh');
  const dumps = readdirSync('deploy/backups/daily').filter((f) => f.endsWith('.dump'));
  const newest = dumps
    .map((f) => ({ f, t: statSync(`deploy/backups/daily/${f}`).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];
  assert.ok(newest, '备份目录里没有 .dump');
  const size = statSync(`deploy/backups/daily/${newest.f}`).size;
  assert.ok(size > 1024, `备份文件只有 ${size} 字节，等于没备`);
  ok(`备份产物 ${newest.f}（${Math.round(size / 1024)}KB）`);

  const rec = JSON.parse(dc('exec', '-T', 'cron', '/scripts/reconcile.sh'));
  assert.ok(rec.ok, `对账返回异常：${JSON.stringify(rec).slice(0, 200)}`);
  ok(`对账完成：检查 ${rec.data.checked} 个用户，漂移 ${rec.data.drifted.length} 个`);

  const bad423 = await fetch(`${BASE}/api/internal/cron/reconcile`, {
    method: 'POST',
    headers: { 'x-cron-secret': 'wrong-secret' },
  });
  assert.equal(bad423.status, 403, `对账端点没校验密钥：HTTP ${bad423.status}`);
  ok('对账端点拒绝错误密钥（403）');

  const restore = execFileSync('bash', ['deploy/scripts/restore-verify.sh'], {
    encoding: 'utf8',
    env: { ...process.env, ENV_FILE: COMPOSE_ENV },
  });
  assert.match(restore, /恢复校验通过/, `恢复演练没过：\n${restore}`);
  ok('备份能真的恢复（行数比对 + 跨表查询通过）');

  assert.equal(bad.length, 0, `非预期请求失败：\n${bad.join('\n')}`);
  await page.screenshot({ path: '.data/shots/deploy-home.png' });
  console.log(`\n✅ 部署验收通过（${pass} 项）`);
} catch (err) {
  console.error(`\n❌ 失败：${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
