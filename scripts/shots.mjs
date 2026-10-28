/**
 * 可视化巡检：注册一个演示账号 → 真跑一次生成 → 把关键页截图到 .data/shots/。
 * 只为「肉眼过一遍」，不做断言（断言在 verify-phaseN.mjs 里）。
 * 用法：node scripts/shots.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = '.data/shots';
const EMAIL = `demo-${Date.now()}@example.test`;
const PASSWORD = 'demo_shots_pw';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2, // 高分屏截图，文字才不糊
});
const page = await ctx.newPage();

const shot = async (name, wait = 1500) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`  📸 ${name}`);
};

// 注册 + 登录
await page.request.post(`${BASE}/api/auth/register`, {
  data: { email: EMAIL, password: PASSWORD },
});
await page.goto(`${BASE}/zh/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });

// 真跑一次生成，好让结果网格里有真图
const genRes = await page.request.post(`${BASE}/api/generate`, {
  data: {
    modelId: 'mock-pro',
    mode: 'textToImage',
    prompt: '雪山下的湖畔小屋，黄昏，暖光，薄雾，电影感',
    negativePrompt: '低质量, 模糊, 变形',
    aspectRatio: '16:9',
    resolution: '2K',
    batchCount: 4,
    seed: '884213',
    guidance: 7,
    idempotencyKey: `shots-${Date.now()}`,
  },
});
const gen = (await genRes.json()).data;
console.log('  生成中…', gen.generationId);
for (let i = 0; i < 60; i++) {
  const r = await (await page.request.get(`${BASE}/api/generations/${gen.generationId}`)).json();
  if (['SUCCEEDED', 'PARTIAL', 'FAILED'].includes(r.data?.status)) break;
  await page.waitForTimeout(1000);
}

for (const [path, name, wait] of [
  ['/zh', '01-首页', 2500],
  ['/zh/generate', '02-生成器', 2500],
  ['/zh/explore', '03-探索广场', 2500],
  ['/zh/explore/highland-dawn', '04-作品详情', 2000],
  [`/zh/history/${gen.generationId}`, '05-生成结果', 2500],
  ['/zh/history', '06-历史记录', 2000],
  ['/zh/tools', '07-工具页', 2000],
  ['/zh/tools/background-removal', '08-抠图工具', 2000],
  ['/zh/account', '09-账号概览', 2000],
  ['/zh/account/credits', '10-积分明细', 2000],
  ['/en', '11-英文首页', 2000],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await shot(name, wait);
}

console.log(`\n✅ 截图已存到 ${OUT}/  （演示账号 ${EMAIL} / ${PASSWORD}）`);
await browser.close();
