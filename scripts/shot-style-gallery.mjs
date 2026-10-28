import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
).newPage();

const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 120)));

await page.goto('http://localhost:3000/zh/generate', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /不使用风格|风格/ }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: '.data/shots/12-风格画廊.png' });

const imgs = await page
  .locator('img')
  .evaluateAll((els) => els.map((e) => ({ src: e.currentSrc || e.src, w: e.naturalWidth })));
console.log('img 总数', imgs.length, '已解码', imgs.filter((i) => i.w > 0).length);
console.log('未解码的：', imgs.filter((i) => i.w === 0).map((i) => i.src).slice(0, 5));
console.log('控制台错误：', errs.slice(0, 5));

await browser.close();
