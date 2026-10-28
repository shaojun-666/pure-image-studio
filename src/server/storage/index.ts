import { env } from '../env';
import { localDriver } from './local';
import { ossDriver } from './oss';
import type { StorageDriver } from './types';

export type { PutOptions, StorageDriver, StoredObject } from './types';
export { keys, extFor } from './keys';

/**
 * 存储接缝。调用方只认 StorageDriver 接口，换驱动不改业务代码。
 * 两处刻意的不对称：local 的 signedUrl 是相对路径（同进程 API 文件出口），
 * oss 的 publicUrl 走 CDN 域名——见 deploy/README.md 的桶策略。
 */
export const storage: StorageDriver =
  env.STORAGE_DRIVER === 'oss' ? ossDriver : localDriver;

export const isLocalStorage = storage.key === 'local';
