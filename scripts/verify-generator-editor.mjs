/**
 * 生成器内画布编辑器验收 —— 局部重绘 / 扩图 在 /generate 里真的能跑通。
 *
 * 断言落在这几处，而不是「按钮点得动」：
 *   · 没涂蒙版时生成按钮是禁用的，涂完才放行
 *   · 提交带上了 maskAssetId / expand（服务端返回的 mode 与参数对得上）
 *   · 任务最终跑出图（succeededCount > 0），说明蒙版确实被下游接受了
 *
 * 用法：node scripts/verify-generator-editor.mjs   （需先 pnpm dev）
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * 蒙版有没有真的落到 DB，公开详情接口是看不到的（它按契约只出 DTO 字段，
 * 不暴露 maskAssetId —— 那是给 executor 用的内部标量）。
 * 与其为了测试去撑大 DTO，不如直接读库：这里查的就是管道真正依赖的那一列。
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
/** 拿一张已经在磁盘上的真图当底图，不必现场造文件 */
const INIT_IMAGE = '.data/storage/public/explore/highland-dawn.webp';

const EMAIL = `gen-editor-${Date.now()}@example.test`;
const PASSWORD = 'gen_editor_pw';

let pass = 0;
const ok = (m) => {
  pass++;
  console.log(`  ✅ ${m}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const bad = [];
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('/api/me')) {
    bad.push(`${r.status()} ${r.url().replace(BASE, '')}`);
  }
});
let lastBody = null;
page.on('response', async (r) => {
  if (r.url().endsWith('/api/generate')) lastBody = await r.json().catch(() => null);
});

/** 提交一次生成，返回 generationId */
async function submitAndWait(label) {
  lastBody = null;
  const btn = page.getByRole('button', { name: '开始生成' });
  assert.ok(!(await btn.isDisabled()), `${label}：生成按钮仍是禁用的`);
  await btn.click();
  await page.waitForTimeout(1500);
  assert.ok(lastBody, `${label}：没有收到 /api/generate 响应`);
  assert.ok(lastBody.ok, `${label}：提交失败 ${JSON.stringify(lastBody).slice(0, 200)}`);
  const id = lastBody.data.generationId;
  ok(`${label}：提交成功 held=${lastBody.data.creditsHeld} id=${id.slice(0, 8)}…`);

  // 等任务跑完（mock 单张 1.8s）
  for (let i = 0; i < 60; i++) {
    const r = await page.request.get(`${BASE}/api/generations/${id}`);
    const g = (await r.json()).data;
    if (g.status === 'SUCCEEDED' || g.status === 'PARTIAL' || g.status === 'FAILED') {
      return { id, gen: g };
    }
    await sleep(1000);
  }
  throw new Error(`${label}：任务超时未结束`);
}

try {
  console.log('\n[0] 建号 + 上传底图');
  const reg = await page.request.post(`${BASE}/api/auth/register`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  assert.ok(reg.ok(), `注册失败 ${reg.status()}`);
  await page.goto(`${BASE}/zh/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });

  // ───────────── 局部重绘 ─────────────

  console.log('\n[1] 局部重绘：蒙版画笔');
  await page.goto(`${BASE}/zh/generate`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '局部重绘' }).first().click();
  await page.waitForTimeout(300);
  // 提示词先填上：生成按钮在提示词为空时本来就禁用，
  // 不填的话「按钮亮了」就分不清是蒙版起效还是别的条件起效
  await page.locator('textarea').first().fill('把这里换成一片湖');
  await page.waitForTimeout(300);

  await page.locator('input[type="file"]').first().setInputFiles(INIT_IMAGE);
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ timeout: 15_000 });
  const box = await canvas.boundingBox();
  ok(`底图上传完成，画布 ${Math.round(box.width)}×${Math.round(box.height)}`);

  const btn = page.getByRole('button', { name: '开始生成' });
  assert.ok(await btn.isDisabled(), '还没涂蒙版，生成按钮就该是禁用的');
  ok('未涂蒙版 → 生成按钮禁用');

  // 在画布中央画一道
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width * (0.35 + i * 0.03), box.y + box.height * 0.5);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert.ok(!(await btn.isDisabled()), '涂完蒙版按钮仍禁用');
  ok('涂抹后 → 生成按钮放行');

  await page.screenshot({ path: '.data/shots/generator-inpaint.png' });

  const { id: inpaintId, gen: inpaint } = await submitAndWait('局部重绘');
  assert.equal(inpaint.mode, 'inpaint', `mode 不对：${inpaint.mode}`);
  const row = await prisma.generation.findUnique({
    where: { id: inpaintId },
    select: { maskAssetId: true, referenceAssetIds: true },
  });
  assert.ok(row.maskAssetId, '库里没记下 maskAssetId —— 蒙版根本没提交上去');
  assert.ok(row.referenceAssetIds.length > 0, '库里没记下底图');
  ok(`库里 maskAssetId=${row.maskAssetId.slice(0, 8)}…`);
  assert.ok(inpaint.succeededCount > 0, `一张都没出：${inpaint.status}`);
  ok(`重绘完成：${inpaint.succeededCount}/${inpaint.batchCount} 张，mask 已入库`);

  // ───────────── 扩图 ─────────────

  console.log('\n[2] 扩图：8 向手柄');
  await page.getByRole('tab', { name: '扩图' }).first().click();
  await page.waitForTimeout(500);
  const handle = page.locator('[data-handle="e"]').first();
  await handle.waitFor({ timeout: 10_000 });
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  // 右向手柄往外拖才是扩：往左拖是缩小，会被钳到 0，看起来「提交成功但什么也没发生」
  await page.mouse.move(hb.x + hb.width / 2 + 90, hb.y + hb.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  ok('拖动了右向手柄');

  const { id: outpaintId, gen: outpaint } = await submitAndWait('扩图');
  assert.equal(outpaint.mode, 'outpaint', `mode 不对：${outpaint.mode}`);
  const orow = await prisma.generation.findUnique({
    where: { id: outpaintId },
    select: { params: true },
  });
  const ex = (orow.params ?? {}).expand ?? {};
  // 全 0 等于没扩：手柄白拖了，这种「提交成功但什么也没发生」最该被抓住
  assert.ok(
    (ex.left ?? 0) + (ex.right ?? 0) + (ex.top ?? 0) + (ex.bottom ?? 0) > 0,
    `expand 全 0（手柄没生效）：${JSON.stringify(orow.params)}`,
  );
  assert.ok(outpaint.succeededCount > 0, `一张都没出：${outpaint.status}`);
  ok(`扩图完成：expand=${JSON.stringify(ex)}`);
  await page.screenshot({ path: '.data/shots/generator-outpaint.png' });

  // ───────────── 其余模式没被误伤 ─────────────

  console.log('\n[3] 回归：文生图不受影响');
  await page.getByRole('tab', { name: '文生图' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('textarea').first().fill('一只橘猫在屋顶上');
  await page.waitForTimeout(300);
  const { gen: t2i } = await submitAndWait('文生图');
  assert.equal(t2i.mode, 'textToImage');
  assert.ok(t2i.succeededCount > 0, '文生图没出图');
  ok('文生图正常出图');

  assert.equal(bad.length, 0, `非预期请求失败：\n${bad.join('\n')}`);
  console.log(`\n✅ 生成器内画布编辑器验收通过（${pass} 项）`);
} catch (err) {
  console.error(`\n❌ 失败：${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
