/**
 * 真实模型端到端验收：走完整应用管道出一张真图。
 *
 * 与 verify-phase8.mts 的分工：那个验的是 provider **接缝**（fetch 打桩，不花钱），
 * 这个验的是「接到真厂商之后整条链路还通不通」—— 能力门控、任务派发、落盘、
 * 缩略图、积分结算，一个都不跳过。sample 图脚本走的是 provider 直连，绕过了这些。
 *
 * 前置：pnpm dev 在跑，数据库已 seed，.env 里有 DASHSCOPE_API_KEY。
 * 用法：node scripts/verify-real-model.mjs [modelId]     默认 z-image-turbo（最便宜）
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MODEL = process.argv[2] ?? 'z-image-turbo';
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@aigc.local';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin_dev_pw_2026';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++;
  else failures.push(name);
}

/** 一个独立的 cookie 罐。 */
function session(label) {
  let cookie = '';
  const call = async (pathname, init = {}) => {
    const res = await fetch(`${BASE}${pathname}`, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie },
      redirect: 'manual',
    });
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    return res;
  };
  const json = async (pathname, init) => {
    const res = await call(pathname, init);
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* 非 JSON */
    }
    return { status: res.status, body };
  };
  return {
    label,
    json,
    login: async (email, password) => {
      const csrf = await (await call('/api/auth/csrf')).json();
      await call('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password }),
      });
      if (!cookie.includes('session-token')) throw new Error(`${label} 登录失败`);
    },
  };
}

/** 余额字段各版本叫法不一，兜着找 */
function balanceOf(body) {
  const d = body?.data ?? body;
  return d?.creditBalance ?? d?.balance ?? d?.credits ?? null;
}

async function main() {
  console.log(`\n[1] 登录 @ ${BASE}`);
  const s = session(MODEL);
  await s.login(EMAIL, PASSWORD);

  console.log(`\n[2] 模型目录里确认 ${MODEL} 存在且可用`);
  const models = await s.json('/api/models');
  const list = models.body?.data ?? models.body ?? [];
  const m = list.find((x) => x.id === MODEL);
  check(`${MODEL} 在目录里`, Boolean(m));
  if (!m) throw new Error(`目录里没有 ${MODEL}，可用的有：${list.map((x) => x.id).join(', ')}`);
  console.log(`      档位=${m.tier} 单张=${m.creditCost} 积分`);
  check('能力门控开了文生图', m.capabilities?.modes?.textToImage === true);

  const before = balanceOf((await s.json('/api/me')).body);
  console.log(`      提交前余额=${before}`);

  console.log('\n[3] 提交一次真实生成');
  const submit = await s.json('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      modelId: MODEL,
      mode: 'textToImage',
      idempotencyKey: `real-${Date.now()}`,
      prompt: 'a red lighthouse on a cliff at dawn, calm sea, soft light',
      aspectRatio: '1:1',
      resolution: '1K',
      batchCount: 1,
    }),
  });
  check('POST /api/generate → 202', submit.status === 202, `HTTP ${submit.status}`);
  const id = submit.body?.data?.generationId;
  if (!id) throw new Error(`没拿到 generationId：${JSON.stringify(submit.body).slice(0, 300)}`);
  console.log(`      generationId=${id}`);

  console.log('\n[4] 轮询到终态（真实厂商同步出图，通常十几秒）');
  let g = null;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const r = await s.json(`/api/generations/${id}`);
    g = r.body?.data;
    if (!g) continue;
    if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED'].includes(g.status)) break;
    if (i % 5 === 0) console.log(`      … ${g.status}`);
  }
  check('终态是 SUCCEEDED', g?.status === 'SUCCEEDED', `实际 ${g?.status}${g?.errorMessage ? ' / ' + g.errorMessage : ''}`);
  check('拿到 1 张成图', g?.images?.length === 1, `实际 ${g?.images?.length}`);

  const img = g?.images?.[0];
  check('成图状态 SUCCEEDED', img?.status === 'SUCCEEDED', `实际 ${img?.status}`);
  check('有签名缩略图 URL', Boolean(img?.thumbUrl));
  check('有真实尺寸（不是 0）', (img?.width ?? 0) > 0 && (img?.height ?? 0) > 0, `${img?.width}x${img?.height}`);
  check('有 blur 占位图', Boolean(img?.placeholder));
  console.log(`      落盘 key=${img?.storageKey ?? '(无)'}`);

  console.log('\n[5] 积分结算');
  console.log(`      creditsHeld=${g?.creditsHeld} creditsSpent=${g?.creditsSpent} creditsRefunded=${g?.creditsRefunded}`);
  check('实扣 = 单张价 × 成功张数', g?.creditsSpent === m.creditCost, `${g?.creditsSpent} vs ${m.creditCost}`);
  check('没有多退', !g?.creditsRefunded, `refunded=${g?.creditsRefunded}`);

  const after = balanceOf((await s.json('/api/me')).body);
  console.log(`      提交后余额=${after}`);
  if (before !== null && after !== null) {
    check('余额减少恰好等于实扣', before - after === g?.creditsSpent, `${before} - ${after} = ${before - after}`);
  } else {
    console.log('      （余额字段没找到，跳过余额差分断言）');
  }

  console.log(`\n${failures.length ? '❌' : '✅'} ${pass} 通过 / ${failures.length} 失败`);
  if (failures.length) {
    for (const f of failures) console.log(`   - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\n💥 ${e.message}`);
  process.exit(1);
});
