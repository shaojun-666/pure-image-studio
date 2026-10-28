import type { ModelDescriptor } from '@/lib/ai/contracts';
import { env } from '../env';
import { ProviderError } from './errors';
import { dashscopeProvider } from './dashscope';
import { mockProvider } from './mock';
import { ofoxProvider } from './ofox';
import type { ImageProvider } from './types';
import { volcengineProvider } from './volcengine';

/**
 * ★ 接入新厂商 = 新增一个 provider 文件 + 这里加一行。别处一律不改。
 *   模型描述写在该 provider 文件内部，能力开关和积分价因此跟着实现走。
 */
export const PROVIDERS: Record<string, ImageProvider> = {
  // 没配 key 就不注册：否则下拉框里会多出一个点了必然失败的模型
  ...(env.ARK_API_KEY ? { volcengine: volcengineProvider } : {}),
  ...(env.DASHSCOPE_API_KEY ? { dashscope: dashscopeProvider } : {}),
  ...(env.OFOX_API_KEY ? { ofox: ofoxProvider } : {}),
  /**
   * mock 排在最后是有意的：text.ts 的 resolve() 按 Object.values 的顺序
   * 找「实现了 enhancePrompt 的 provider」兜底。mock 排在前面的话，
   * 真 provider 明明实现了提示词助手却永远选不中，用户拿到的是模板拼接。
   * 它也不再进用户的下拉框（isVisible: false），只服务开发与验收脚本。
   */
  mock: mockProvider,
};

export function getProvider(key: string): ImageProvider {
  const p = PROVIDERS[key];
  if (!p) throw new ProviderError('invalid_request', `未注册的 provider：${key}`);
  return p;
}

/** 所有 provider 的模型摊平成一张目录 */
export function flatCatalog(): ModelDescriptor[] {
  return Object.values(PROVIDERS).flatMap((p) => [...p.models]);
}

export function findInCatalog(modelId: string): ModelDescriptor | undefined {
  return flatCatalog().find((m) => m.id === modelId);
}
