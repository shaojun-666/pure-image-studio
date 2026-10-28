import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { statSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env';
import type { PutOptions, StorageDriver } from './types';

/**
 * 开发用本地驱动：写 .data/storage，零云配置。
 * signedUrl 返回 /api/files/{key}?exp&sig，签名算法与 verifyKey 成对。
 */

const root = path.resolve(process.cwd(), env.STORAGE_LOCAL_ROOT);

/** 防止 ../ 穿越出根目录 */
function resolveKey(key: string): string {
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`非法存储 key：${key}`);
  }
  return full;
}

export function signKey(key: string, exp: number): string {
  return createHmac('sha256', env.AUTH_SECRET)
    .update(`${key}:${exp}`)
    .digest('base64url');
}

export function verifyKey(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = Buffer.from(signKey(key, exp));
  const given = Buffer.from(sig);
  return (
    expected.length === given.length && timingSafeEqual(expected, given)
  );
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

function mimeOf(key: string): string {
  return MIME_BY_EXT[path.extname(key).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

export const localDriver: StorageDriver = {
  key: 'local',

  async put(key, body, opts: PutOptions) {
    const full = resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return { key, bytes: body.byteLength, contentType: opts.contentType };
  },

  async get(key) {
    const full = resolveKey(key);
    let s;
    try {
      s = await stat(full);
    } catch {
      return null;
    }
    // 原本这里 stat 只是为了探存在性，结果被扔了。顺手拿它当 ETag —— 免费。
    return {
      body: createReadStream(full),
      contentType: mimeOf(key),
      etag: `"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"`,
      lastModified: s.mtime,
    };
  },

  async head(key) {
    try {
      const s = await stat(resolveKey(key));
      return { bytes: s.size, contentType: mimeOf(key) };
    } catch {
      return null;
    }
  },

  async delete(key) {
    await rm(resolveKey(key), { force: true });
  },

  async signedUrl(key, opts = {}) {
    const exp = Date.now() + (opts.expiresIn ?? 3600) * 1000;
    const q = new URLSearchParams({ exp: String(exp), sig: signKey(key, exp) });
    if (opts.downloadName) q.set('name', opts.downloadName);
    // 相对地址：本地 provider 就在同进程，不需要绝对域名
    return `/api/files/${key}?${q}`;
  },

  /**
   * ★ 必须带版本号。public/* 下的缩略图/封面是**原地重写、URL 不变**的
   * （scripts/gen-samples.ts 直接覆盖同名文件），少了版本号，浏览器和任何
   * 中间层都会心安理得地一直吃老图 —— 历史上这里发过 immutable，用户
   * 连刷两次都还是旧图，就是这么来的。
   *
   * 版本取文件 mtime：内容没换 URL 就不变，换了立刻是新 URL，无需强刷、
   * 无需重启。statSync 每次调用约十几微秒，一页 37 张也就零点几毫秒，
   * 比为此把 publicUrl 改成异步（会波及 serializeCard 等同步调用点）划算得多。
   */
  publicUrl(key) {
    let version = '';
    try {
      version = `?v=${Math.floor(statSync(resolveKey(key)).mtimeMs).toString(36)}`;
    } catch {
      // 文件还没生成（seed 补图之前的空窗）——不挂版本号，照常返回
    }
    return `${env.CDN_BASE_URL}/${key}${version}`;
  },
};
