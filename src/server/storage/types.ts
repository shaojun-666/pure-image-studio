import type { Readable } from 'node:stream';

export interface PutOptions {
  contentType: string;
  cacheControl?: string;
}

export interface StoredObject {
  key: string;
  bytes: number;
  contentType: string;
}

export interface StorageDriver {
  readonly key: 'local' | 'oss';
  put(key: string, body: Buffer, opts: PutOptions): Promise<StoredObject>;
  /**
   * etag / lastModified 可选：本地驱动由 stat 现算（零额外开销），
   * 供 /api/files 做条件请求，重出图后能回 304 而不是重传整张图。
   */
  get(key: string): Promise<
    | { body: Readable; contentType: string; etag?: string; lastModified?: Date }
    | null
  >;
  head(key: string): Promise<{ bytes: number; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** 短时效可访问地址。★ 绝不入库，每次序列化时现算 */
  signedUrl(
    key: string,
    opts?: { expiresIn?: number; downloadName?: string },
  ): Promise<string>;
  /**
   * 公开前缀（public/*）的地址，走 CDN。
   * 本地驱动会挂 mtime 版本号（这些文件会被原地重写，见 local.ts）。
   */
  publicUrl(key: string): string;
}
