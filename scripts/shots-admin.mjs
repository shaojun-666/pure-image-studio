/**
 * 后台七页截图漫步 —— 验收脚本只打 API，页面本身会不会白屏它测不到。
 *
 * 用法：node --env-file=.env scripts/shots-admin.mjs   （需先 pnpm dev）
 * 产物：.data/shots/admin/*.png
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = '.data/shots/admin';

const PAGES = [
  ['dashboard', '/zh/admin'],
  ['explore', '/zh/admin/explore'],
  ['models', '/zh/admin/models'],
  ['styles', '/zh/admin/styles'],
  ['prompts', '/zh/admin/prompts'],
  ['users', '/zh/admin/users'],
  ['generations', '/zh/admin/generations'],
];

assert.ok(process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD, '需要 --env-file=.env');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const bad = [];
page.on('console', (m) => m.type() === 'error' && bad.push(`console: ${m.text()}`));
page.on('response', (r) => {
  // 401 /api/me 是未登录站头的正常表现，这里已登录，不该再出现
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(BASE, '')}`);
});

await page.goto(`${BASE}/zh/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', process.env.SEED_ADMIN_EMAIL);
await page.fill('input[type="password"]', process.env.SEED_ADMIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });
bad.length = 0;

for (const [name, path] of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  // 列表是客户端查询，等骨架屏落成行；太短会把「还在加载」误判成 0 行
  await page
    .locator('tbody tr')
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(500);

  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  if (!h1.trim()) {
    // 白屏时把页面实际内容打出来，否则只能看到「没有标题」这种没法定位的结论
    console.error(`\n${path} 没有 h1，页面正文：\n${(await page.locator('body').innerText()).slice(0, 600)}\n`);
    if (bad.length) console.error(`失败的请求：\n${bad.join('\n')}`);
  }
  assert.ok(h1.trim(), `${path} 没有标题，可能白屏`);
  const text = (await page.locator('body').allInnerTexts()).join('\n');
  assert.ok(!/Application error|Internal Server Error/.test(text), `${path} 渲染出错误页`);

  const rows = await page.locator('tbody tr').count();
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  📸 ${name.padEnd(12)} h1="${h1.trim()}" 行数=${rows}`);
}

assert.equal(bad.length, 0, `请求失败：\n${bad.join('\n')}`);
console.log(`\n✅ 后台七页均正常渲染，截图在 ${OUT}/`);
await browser.close();
