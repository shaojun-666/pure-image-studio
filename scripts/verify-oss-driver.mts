/**
 * OSS 驱动离线校验。
 *
 * 没有 bucket 也能验的部分就这些：驱动选择、publicUrl 拼的是 CDN 域名、
 * signedUrl 真的签了名且有效期可控。真正的上传下载要等有 bucket 才能验 ——
 * 别让「类型过了」冒充「跑通了」。
 *
 * 用法：pnpm tsx scripts/verify-oss-driver.mts
 */
import assert from 'node:assert/strict';

// env.ts 在模块求值时就校验，所以这些必须在 import 之前设好
process.env.STORAGE_DRIVER = 'oss';
process.env.DATABASE_URL = 'postgresql://x:x@localhost:5432/x';
process.env.AUTH_SECRET = 'oss-driver-verify-secret-0123456789';
process.env.CDN_BASE_URL = 'https://cdn.example.cn';
process.env.OSS_REGION = 'oss-cn-hangzhou';
process.env.OSS_BUCKET = 'verify-bucket';
process.env.OSS_ENDPOINT = 'oss-cn-hangzhou.aliyuncs.com';
process.env.OSS_ENDPOINT_INTERNAL = 'oss-cn-hangzhou-internal.aliyuncs.com';
process.env.OSS_USE_INTERNAL = 'true';
process.env.OSS_ACCESS_KEY_ID = 'AKID_FAKE_FOR_VERIFY';
process.env.OSS_ACCESS_KEY_SECRET = 'FAKE_SECRET_FOR_VERIFY';

const { storage, isLocalStorage } = await import('../src/server/storage');
const { ossDriver } = await import('../src/server/storage/oss');

let pass = 0;
const ok = (m: string) => {
  pass++;
  console.log(`  ✅ ${m}`);
};

console.log('\n[1] 驱动选择');
assert.equal(ossDriver.key, 'oss');
assert.equal(storage.key, 'oss', 'STORAGE_DRIVER=oss 时选中的不是 OSS 驱动');
assert.equal(isLocalStorage, false, 'isLocalStorage 应为 false —— /api/files 会据此 404');
ok('STORAGE_DRIVER=oss → 选中 OSS 驱动，isLocalStorage=false');

console.log('\n[2] publicUrl 走 CDN 域名');
const pub = storage.publicUrl('public/styles/ink-wash.webp');
assert.equal(pub, 'https://cdn.example.cn/public/styles/ink-wash.webp');
ok(`publicUrl = ${pub}`);

console.log('\n[3] signedUrl 真的签名了');
const KEY = 'u/u_123/gen/g_456/00.png';
const url = new URL(await storage.signedUrl(KEY));
assert.equal(url.host, 'verify-bucket.oss-cn-hangzhou-internal.aliyuncs.com', `域名不对：${url.host}`);
assert.ok(url.pathname.endsWith(KEY), `路径里没有 key：${url.pathname}`);
assert.ok(url.searchParams.get('Signature'), '没有签名参数 —— 桶是私有的，这样必 403');
assert.ok(url.searchParams.get('OSSAccessKeyId'), '没有 AccessKeyId');
const expires = Number(url.searchParams.get('Expires'));
const delta = expires - Math.floor(Date.now() / 1000);
// ali-oss 取整会让边界差 1 秒，别把 3601 当错误
assert.ok(delta > 3500 && delta <= 3602, `默认有效期不是 1 小时：${delta}s`);
ok(`默认签名 URL 有效 ${delta}s，host 是内网 endpoint`);

console.log('\n[4] expiresIn 与下载文件名');
const short = new URL(
  await storage.signedUrl(KEY, { expiresIn: 60, downloadName: '我的作品.png' }),
);
const shortDelta = Number(short.searchParams.get('Expires')) - Math.floor(Date.now() / 1000);
assert.ok(shortDelta > 50 && shortDelta <= 62, `expiresIn=60 没生效：${shortDelta}s`);
assert.ok(
  short.searchParams.get('response-content-disposition')?.includes(
    encodeURIComponent('我的作品.png'),
  ),
  'downloadName 没进 response-content-disposition',
);
ok('expiresIn / downloadName 都生效');

console.log(`\n✅ OSS 驱动离线校验通过（${pass} 项）`);
console.log('⚠️  未验：真实 put/get/delete（需要 bucket）');
