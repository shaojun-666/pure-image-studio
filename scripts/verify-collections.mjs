/**
 * 收藏夹集合验收 —— /api/me/collections 一族。
 *
 * 重点不是「接口通不通」，而是三件容易写错的事：
 *   1. 归属隔离：A 既不能读、也不能往 B 的集合里塞图（都该回 404，不是 403）
 *   2. 幂等：重复加同一批图不该把 itemCount 加两次
 *   3. 冗余字段：itemCount / coverImageId 在增删后必须与实际一致
 *
 * 用两个全新注册的账号跑，不碰 seed 的管理员账号。
 * 前置：pnpm dev 在跑，数据库已 seed（mock-flash 可用）。
 * 用法：node scripts/verify-collections.mjs
 */
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++;
  else failures.push(name);
}

/** 一个独立的 cookie 罐。每个账号一个，互不串味。 */
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
      /* 非 JSON（比如重定向的 HTML） */
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
      if (!cookie.includes('session-token')) {
        throw new Error(`${label} 登录失败`);
      }
    },
  };
}

async function registerAndLogin(tag) {
  const s = session(tag);
  const email = `coll-${tag}-${Date.now()}@example.test`;
  const password = 'coll_verify_pw';
  const res = await s.json('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status >= 400) {
    throw new Error(`${tag} 注册失败 ${res.status}: ${JSON.stringify(res.body)}`);
  }
  await s.login(email, password);
  return s;
}

/** 走真实生成管道拿几张真图，比直接塞 DB 行更能证明接口拿得到图。 */
async function generate(s, prompt) {
  const res = await s.json('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      modelId: 'mock-flash',
      mode: 'textToImage',
      idempotencyKey: randomUUID(),
      prompt,
      aspectRatio: '1:1',
      resolution: '1K',
      batchCount: 1,
    }),
  });
  if (res.status !== 202) {
    throw new Error(`提交生成失败 ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const id = res.body.data.generationId;

  for (let i = 0; i < 80; i++) {
    await sleep(500);
    const { body } = await s.json(`/api/generations/${id}`);
    const g = body?.data;
    if (!g) continue;
    if (['SUCCEEDED', 'PARTIAL', 'FAILED'].includes(g.status)) {
      const imgs = g.images.filter((x) => x.status === 'SUCCEEDED');
      if (!imgs.length) throw new Error(`出图失败：${g.status} ${g.errorMessage ?? ''}`);
      return imgs.map((x) => x.id);
    }
  }
  throw new Error('出图超时');
}

const post = (s) => (path, body) =>
  s.json(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const del = (s) => (path, body) =>
  s.json(path, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const patch = (s) => (path, body) =>
  s.json(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function main() {
  console.log(`\n[1] 注册两个账号 @ ${BASE}`);
  const A = await registerAndLogin('a');
  const B = await registerAndLogin('b');
  console.log(`  A=${A.label} B=${B.label}`);

  console.log('\n[2] A 出 1 张图，B 出 2 张图');
  const [aImg] = await generate(A, 'A 的图：赛博朋克屋顶的猫');
  const bImgs = [
    (await generate(B, 'B 的图一：水墨山峦'))[0],
    (await generate(B, 'B 的图二：水彩海岸'))[0],
  ];
  check('A 拿到 1 张成图', Boolean(aImg));
  check('B 拿到 2 张成图', bImgs.filter(Boolean).length === 2);

  console.log('\n[3] B 建集合');
  const created = await post(B)('/api/me/collections', { name: '验证集合' });
  check('POST 返回 201', created.status === 201, `HTTP ${created.status}`);
  const cid = created.body?.data?.id;
  check('返回了 id 且初始为 0 张', Boolean(cid) && created.body.data.itemCount === 0);

  const listed = await B.json('/api/me/collections');
  check(
    'GET 列表里有这个集合',
    listed.body?.data?.items?.some((c) => c.id === cid),
  );

  console.log('\n[4] 归属隔离：B 加 A 的图');
  const stolen = await post(B)(`/api/me/collections/${cid}/items`, { imageIds: [aImg] });
  check('别人的图被静默丢弃（added=0）', stolen.body?.data?.added === 0, `added=${stolen.body?.data?.added}`);
  const afterSteal = await B.json(`/api/me/collections/${cid}`);
  check('张数没被加进去', afterSteal.body?.data?.collection?.itemCount === 0);

  console.log('\n[5] B 加自己的 2 张图');
  const added = await post(B)(`/api/me/collections/${cid}/items`, { imageIds: bImgs });
  check('added=2', added.body?.data?.added === 2, `added=${added.body?.data?.added}`);

  const detail = await B.json(`/api/me/collections/${cid}`);
  const d = detail.body?.data;
  check('itemCount=2', d?.collection?.itemCount === 2, `itemCount=${d?.collection?.itemCount}`);
  check('items 返回 2 张', d?.items?.length === 2);
  check('每张都带签名缩略图 URL', d?.items?.every((i) => Boolean(i.thumbUrl)));

  const card = (await B.json('/api/me/collections')).body.data.items.find((c) => c.id === cid);
  check('卡片墙有封面了', Boolean(card?.coverUrl));

  console.log('\n[6] 幂等：重复加同一批');
  const again = await post(B)(`/api/me/collections/${cid}/items`, { imageIds: bImgs });
  const afterAgain = (await B.json(`/api/me/collections/${cid}`)).body.data;
  check('第二次 added=0', again.body?.data?.added === 0, `added=${again.body?.data?.added}`);
  check(
    'itemCount 仍是 2（没被加两次）',
    afterAgain.collection.itemCount === 2,
    `itemCount=${afterAgain.collection.itemCount}`,
  );

  console.log('\n[7] 移出 1 张');
  const removed = await del(B)(`/api/me/collections/${cid}/items`, { imageIds: [bImgs[0]] });
  const afterRemove = (await B.json(`/api/me/collections/${cid}`)).body.data;
  check('removed=1', removed.body?.data?.removed === 1);
  check('itemCount=1', afterRemove.collection.itemCount === 1, `itemCount=${afterRemove.collection.itemCount}`);

  const card2 = (await B.json('/api/me/collections')).body.data.items.find((c) => c.id === cid);
  check('封面换成了剩下的那张', card2?.coverUrl && card2.coverUrl !== card?.coverUrl);

  console.log('\n[8] 重命名');
  const renamed = await patch(B)(`/api/me/collections/${cid}`, { name: '改过名的集合' });
  check('PATCH 生效', renamed.body?.data?.name === '改过名的集合', renamed.body?.data?.name);
  const badName = await patch(B)(`/api/me/collections/${cid}`, { name: '' });
  check('空名字被拒（422）', badName.status === 422, `HTTP ${badName.status}`);

  console.log('\n[9] 越权：A 读/写 B 的集合');
  const peek = await A.json(`/api/me/collections/${cid}`);
  check('A 读 B 的集合 → 404', peek.status === 404, `HTTP ${peek.status}`);
  const inject = await post(A)(`/api/me/collections/${cid}/items`, { imageIds: [aImg] });
  check('A 往 B 的集合加图 → 404', inject.status === 404, `HTTP ${inject.status}`);
  const wipe = await del(A)(`/api/me/collections/${cid}`, { imageIds: [bImgs[0]] });
  check('A 删不掉 B 的集合 → 404', wipe.status === 404, `HTTP ${wipe.status}`);

  console.log('\n[10] B 删集合');
  const gone = await del(B)(`/api/me/collections/${cid}`);
  check('DELETE 成功', gone.status === 200, `HTTP ${gone.status}`);
  const afterDel = await B.json(`/api/me/collections/${cid}`);
  check('删完 GET → 404', afterDel.status === 404, `HTTP ${afterDel.status}`);
  const finalList = await B.json('/api/me/collections');
  check(
    '列表里也没有了',
    !finalList.body.data.items.some((c) => c.id === cid),
  );

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
