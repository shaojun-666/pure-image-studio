/**
 * 回归守卫：生成器 8 个模式 Tab 在桌面宽度下必须全部可见、可点。
 *
 * 起因：模式 Tab 曾在左栏 `lg:grid-cols-[22rem_1fr]` 里溢出成横向滚动，
 * 而标签列表没有可见滚动条 —— 「放大 / 消除 / 风格迁移」在 1440px 下点不到。
 * 光看截图会漏，所以这里逐个断言 boundingBox 落在视口内。
 *
 * 用法：node scripts/check-mode-tabs.mjs   （需先 pnpm dev；匿名可用，生成器页不强制登录）
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MODES = [
  '文生图',
  '图生图',
  '局部重绘',
  '扩图',
  '抠图',
  '放大增强',
  '风格迁移',
  '对象消除',
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${BASE}/zh/generate`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

let pass = 0;
for (const label of MODES) {
  const tab = page.getByRole('tab', { name: label }).first();
  await tab.waitFor({ timeout: 10_000 });
  const box = await tab.boundingBox();
  assert.ok(box, `${label} 没有布局盒`);
  assert.ok(
    box.x >= 0 && box.x + box.width <= 1440,
    `${label} 超出视口：x=${Math.round(box.x)} w=${Math.round(box.width)}`,
  );
  assert.ok(await tab.isVisible(), `${label} 不可见`);
  pass++;
}

// 点得动才算数：切到最后一个模式，确认它真的被选中
await page.getByRole('tab', { name: '对象消除' }).first().click();
await page.waitForTimeout(400);
const selected = await page.getByRole('tab', { name: '对象消除' }).first().getAttribute('aria-selected');
assert.equal(selected, 'true', '点击「对象消除」后没有选中');

await page.screenshot({ path: '.data/shots/generator-tabs.png' });
console.log(`✅ 8 个模式 Tab 在 1440px 下全部可见可点（截图 .data/shots/generator-tabs.png）`);
await browser.close();
