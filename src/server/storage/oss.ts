import OSS from 'ali-oss';
import type { Readable } from 'node:stream';
import { env } from '../env';
import type { StorageDriver } from './types';

/**
 * 生产驱动：阿里云 OSS。
 *
 * 两个最容易踩的点：
 *   · 同区 ECS 必须用内网 endpoint（OSS_USE_INTERNAL=true）——否则流量绕公网，又慢又计费
 *   · 桶是私有的，只把 public/* 前缀开成匿名只读；u/* 一律现算签名，签名 URL 绝不入库
 */

/** 客户端懒建：STORAGE_DRIVER=local 时不该因为缺 OSS 变量在启动阶段就炸 */
let cached: InstanceType<typeof OSS> | null = null;

function client(): InstanceType<typeof OSS> {
  if (cached) return cached;

  const { OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET } =
    env;
  if (
    !OSS_REGION ||
    !OSS_BUCKET ||
    !OSS_ACCESS_KEY_ID ||
    !OSS_ACCESS_KEY_SECRET
  ) {
    throw new Error(
      'STORAGE_DRIVER=oss 需要 OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET',
    );
  }

  const endpoint = env.OSS_USE_INTERNAL
    ? env.OSS_ENDPOINT_INTERNAL
    : env.OSS_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      env.OSS_USE_INTERNAL
        ? 'OSS_USE_INTERNAL=true 但没配 OSS_ENDPOINT_INTERNAL'
        : '缺少 OSS_ENDPOINT',
    );
  }

  cached = new OSS({
    region: OSS_REGION,
    bucket: OSS_BUCKET,
    accessKeyId: OSS_ACCESS_KEY_ID,
    accessKeySecret: OSS_ACCESS_KEY_SECRET,
    endpoint,
    secure: true,
  });
  return cached;
}

/** ali-oss 把 HTTP 错误抛成带 code/status 的对象，不是 Error 子类 */
function isNotFound(e: unknown): boolean {
  const err = e as { code?: string; status?: number } | null;
  return err?.code === 'NoSuchKey' || err?.status === 404;
}

async function headMeta(key: string) {
  try {
    const r = await client().head(key);
    const headers = r.res.headers as Record<string, string>;
    return {
      bytes: Number(headers['content-length'] ?? 0),
      contentType: headers['content-type'] ?? 'application/octet-stream',
    };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function openStream(key: string): Promise<Readable | null> {
  try {
    const r = await client().getStream(key);
    return r.stream as unknown as Readable;
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export const ossDriver: StorageDriver = {
  key: 'oss',

  async put(key, body, opts) {
    await client().put(key, body, {
      mime: opts.contentType,
      headers: opts.cacheControl
        ? { 'Cache-Control': opts.cacheControl }
        : undefined,
    });
    // 字节数和类型本地就能算准，不必回读响应头
    return { key, bytes: body.byteLength, contentType: opts.contentType };
  },

  async get(key) {
    const meta = await headMeta(key);
    if (!meta) return null;
    const body = await openStream(key);
    if (!body) return null;
    return { body, contentType: meta.contentType };
  },

  head: headMeta,

  async delete(key) {
    await client().delete(key);
  },

  async signedUrl(key, opts = {}) {
    return client().signatureUrl(key, {
      expires: opts.expiresIn ?? 3600,
      response: opts.downloadName
        ? {
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`,
          }
        : undefined,
    });
  },

  publicUrl(key) {
    return `${env.CDN_BASE_URL}/${key}`;
  },
};
