/**
 * Phase 2 验收脚本：模型层 + 存储 + 任务管道。
 *
 *   node scripts/verify-phase2.mjs happy    # 正常出图：4 张真 PNG + SSE + 扣费
 *   node scripts/verify-phase2.mjs fail     # MOCK_FAILURE_RATE=1 服务下跑：应 FAILED 且全额退款
 *   node scripts/verify-phase2.mjs async    # MOCK_ASYNC=true 服务下跑：走轮询路径
 *   node scripts/verify-phase2.mjs dedupe   # 同一幂等键提交 3 次：只扣一次钱
 *
 * 前置：pnpm dev 已在跑，且数据库已 seed。
 */
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// BASE_URL 与其它验收脚本保持一致（这里原本只认 BASE，曾导致脚本打到 dev 而
// 自以为在测容器栈 —— fail 通道因此在 rate=0 的实例上跑，白跑两轮）
const BASE = process.env.BASE_URL ?? process.env.BASE ?? 'http://localhost:3000';
const MODE = process.argv[2] ?? 'happy';
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@aigc.local';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin_dev_pw_2026';

let cookie = '';
const failures = [];

function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

async function call(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { ...(init.headers ?? {}), cookie },
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  }
  return res;
}

async function login() {
  const csrfRes = await call('/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();
  const res = await call('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD }),
  });
  if (!cookie.includes('session-token')) {
    throw new Error(`登录失败（${res.status}），cookie=${cookie}`);
  }
}

async function me() {
  const res = await call('/api/me');
  if (!res.ok) throw new Error(`/api/me ${res.status}`);
  return (await res.json()).data;
}

async function submit(overrides = {}) {
  const body = {
    modelId: 'mock-flash',
    mode: 'textToImage',
    idempotencyKey: randomUUID(),
    prompt: '一只猫坐在赛博朋克城市的屋顶，霓虹灯，雨夜',
    aspectRatio: '16:9',
    resolution: '1K',
    batchCount: 4,
    ...overrides,
  };
  const res = await call('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json() };
}

/** 消费 SSE，返回收到的事件序列 */
async function stream(generationId, timeoutMs = 60_000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const events = [];
  try {
    const res = await fetch(`${BASE}/api/generations/${generationId}/events`, {
      headers: { cookie },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`SSE ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = /^event: (.+)$/m.exec(raw)?.[1];
        const data = /^data: (.+)$/m.exec(raw)?.[1];
        if (ev) {
          events.push({ event: ev, data: data ? JSON.parse(data) : null });
          console.log(`    ← ${ev} ${data ? data.slice(0, 110) : ''}`);
        }
      }
      if (events.some((e) => e.event === 'done' || e.event === 'failed')) break;
    }
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  } finally {
    clearTimeout(timer);
  }
  return events;
}

async function detail(id) {
  const res = await call(`/api/generations/${id}`);
  return (await res.json()).data;
}

/** 直接从磁盘数落盘产物 */
async function storageFiles() {
  const root = path.resolve('.data/storage');
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else out.push({ path: full, size: (await stat(full)).size });
    }
  }
  await walk(root);
  return out;
}

// ─────────────────────────────────────────────────────────

await login();
const before = await me();
console.log(`\n[${MODE}] 起始余额 ${before.creditBalance}\n`);

if (MODE === 'dedupe') {
  const key = randomUUID();
  const results = [];
  for (let i = 0; i < 3; i++) {
    results.push(await submit({ idempotencyKey: key, batchCount: 2 }));
  }
  const ids = new Set(results.map((r) => r.json.data?.generationId));
  check('3 次提交只产生 1 条 Generation', ids.size === 1, [...ids].join(','));
  check('后两次标记为幂等命中', results[1].json.data?.deduped === true && results[2].json.data?.deduped === true);
  await stream([...ids][0]);
  const after = await me();
  check(
    '只扣了一次钱（2 张 × 2 积分）',
    before.creditBalance - after.creditBalance === 4,
    `消耗 ${before.creditBalance - after.creditBalance}`,
  );
} else {
  const { res, json } = await submit();
  check('POST /api/generate 返回 202', res.status === 202, `HTTP ${res.status}`);
  if (!json.ok) {
    console.log(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  const id = json.data.generationId;
  console.log(`    generationId=${id} held=${json.data.creditsHeld}\n`);

  const events = await stream(id);
  const kinds = events.map((e) => e.event);
  const images = events.filter((e) => e.event === 'image');
  const done = events.find((e) => e.event === 'done');

  const expectImages = MODE === 'fail' ? 0 : 4;
  check('SSE 先推 status', kinds[0] === 'status', kinds.slice(0, 3).join('→'));
  check(
    `SSE 推了 ${expectImages} 个 image`,
    images.length === expectImages,
    `实收 ${images.length}`,
  );
  check('SSE 以 done 收尾', kinds.at(-1) === 'done', kinds.at(-1));

  const g = await detail(id);
  const expectedStatus = MODE === 'fail' ? 'FAILED' : 'SUCCEEDED';
  check(`最终状态 = ${expectedStatus}`, g.status === expectedStatus, g.status);
  check('4 张图全部 SUCCEEDED', g.images.filter((i) => i.status === 'SUCCEEDED').length === (MODE === 'fail' ? 0 : 4));
  check('图片拿到了签名 URL', MODE === 'fail' || Boolean(g.images[0]?.url?.includes('sig=')));

  // 余额在对账点必须已经结算完，所以先量下来 ——
  // 下面的 seed 重放检查自己也会花钱，不能混进来
  const afterMain = await me();
  const spent = before.creditBalance - afterMain.creditBalance;

  if (MODE !== 'fail') {
    // ★ 只看这次 generation 的目录：存储根下还有别的阶段留下的产物（上传的测试图、
    //   蒙版等），全目录扫会把它们算进来，导致「不是空文件 / 内容互不相同」误报。
    const genDir = new RegExp(`gen[\\\\/]${id}[\\\\/]`);
    const files = (await storageFiles()).filter((f) => genDir.test(f.path));
    const pngs = files
      .filter((f) => f.path.endsWith('.png'))
      .sort((a, b) => a.path.localeCompare(b.path)); // digests[0] 必须对应 00.png
    const thumbs = files.filter((f) => /[\\/]t_\d+\.webp$/.test(f.path));
    check('落盘 4 张真 PNG', pngs.length >= 4, `实收 ${pngs.length}`);
    check('PNG 不是空文件', pngs.every((f) => f.size > 5000), `最小 ${Math.min(...pngs.map((f) => f.size))}B`);
    check('落盘 4 张缩略图', thumbs.length >= 4, `实收 ${thumbs.length}`);

    // 同一 seed 派生出的 4 张必须互不相同，否则「批量」是假的
    const digests = await Promise.all(
      pngs.map(async (f) => createHash('sha256').update(await readFile(f.path)).digest('hex')),
    );
    check('4 张图内容互不相同', new Set(digests).size === pngs.length, `${new Set(digests).size} 种`);

    // 同 seed + 同 prompt 重放必须得到同一张图（异步轮询无状态的前提）
    // 放在余额对账之后：这次重放自己也要花掉 2 积分
    const replay = await call('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelId: 'mock-flash',
        mode: 'textToImage',
        idempotencyKey: randomUUID(),
        prompt: '一只猫坐在赛博朋克城市的屋顶，霓虹灯，雨夜',
        aspectRatio: '16:9',
        resolution: '1K',
        batchCount: 1,
        seed: g.seed,
      }),
    });
    const replayJson = await replay.json();
    if (!replayJson.ok) {
      check('同 seed 重放', false, `HTTP ${replay.status} ${JSON.stringify(replayJson.error)}`);
      console.log(
        failures.length ? `\n❌ ${MODE} 失败\n` : '',
      );
      process.exit(1);
    }
    const replayId = replayJson.data.generationId;
    await stream(replayId);
    const rg = await detail(replayId);
    const rPath = path.join(
      '.data/storage',
      rg.images[0].url.split('?')[0].split('/api/files/')[1],
    );
    const rDigest = createHash('sha256').update(await readFile(rPath)).digest('hex');
    check('同 seed 重放得到同一张图', rDigest === digests[0], rDigest.slice(0, 12));
    check('存了 blur-up 占位图', Boolean(g.images[0]?.placeholder?.startsWith('data:image/webp')));

    // 真的能把图取回来
    const img = await fetch(`${BASE}${g.images[0].url}`);
    const bytes = Buffer.from(await img.arrayBuffer());
    check('签名 URL 能取回图片', img.ok && bytes.length > 5000, `${img.status} ${bytes.length}B`);
    check('是合法 PNG', bytes.subarray(1, 4).toString() === 'PNG', bytes.subarray(0, 8).toString('hex'));
  }

  if (MODE === 'fail') {
    check('失败后余额完全复原', spent === 0, `净消耗 ${spent}，余额 ${afterMain.creditBalance}`);
  } else {
    check('余额扣了 单价×4 = 8', spent === 8, `净消耗 ${spent}`);
  }

}

console.log(
  failures.length
    ? `\n❌ ${MODE} 失败 ${failures.length} 项：${failures.join('、')}\n`
    : `\n✅ ${MODE} 全部通过\n`,
);
process.exit(failures.length ? 1 : 0);
