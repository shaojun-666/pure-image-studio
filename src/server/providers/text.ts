import { scopedLogger } from '../logger';
import { errors } from '@/types/api';
import { ProviderError } from './errors';
import { PROVIDERS, findInCatalog, getProvider } from './index';
import type { ProviderContext } from './types';

/**
 * ProviderError 不是 AppError，直接抛出去会被 http.ts 的 toErrorResponse 吞成
 * 「服务器内部错误 500」—— 用户看到的是一句毫无信息量的兜底文案。
 *
 * 提示词助手和生图不一样：它是用户主动点的按钮，失败了必须说清楚为什么
 * （最典型的是「免费额度已用尽」），否则用户只会以为网站坏了。
 */
function surface(e: unknown): never {
  if (e instanceof ProviderError) throw errors.unsupported(e.message);
  throw e;
}

/**
 * 提示词类工具（润色 / 翻译）走的是 provider 的可选方法。
 * 它们返回文字而不是像素，所以独立于生成管道 —— 不占积分、不进任务队列。
 */
function resolve(modelId?: string): { provider: ReturnType<typeof getProvider>; model: ProviderContext['model'] } {
  if (modelId) {
    const m = findInCatalog(modelId);
    if (m) {
      const p = getProvider(m.providerKey);
      if (p.enhancePrompt || p.translatePrompt) return { provider: p, model: m };
    }
  }
  // 没指定 / 指定的模型不支持时，退回第一个具备该能力的 provider
  for (const p of Object.values(PROVIDERS)) {
    if ((p.enhancePrompt || p.translatePrompt) && p.models[0]) {
      return { provider: p, model: p.models[0] };
    }
  }
  throw errors.unsupported('当前没有可用的提示词助手');
}

function ctxOf(
  model: ProviderContext['model'],
  req: Request,
  userId: string,
  tool: string,
): ProviderContext {
  const requestId = `${tool}-${Date.now().toString(36)}`;
  return {
    signal: req.signal,
    model,
    requestId,
    userId,
    logger: scopedLogger({ tool, requestId, userId }),
  };
}

export async function enhancePrompt(input: {
  prompt: string;
  mode: string;
  locale: string;
  styleHint?: string;
  modelId?: string;
  req: Request;
  userId: string;
}) {
  const { provider, model } = resolve(input.modelId);
  if (!provider.enhancePrompt) throw errors.unsupported('当前模型不支持提示词润色');
  try {
    return await provider.enhancePrompt(
      {
        prompt: input.prompt,
        mode: input.mode as never,
        locale: input.locale,
        styleHint: input.styleHint,
      },
      ctxOf(model, input.req, input.userId, 'enhance'),
    );
  } catch (e) {
    return surface(e);
  }
}

export async function translatePrompt(input: {
  text: string;
  to: string;
  modelId?: string;
  req: Request;
  userId: string;
}) {
  const { provider, model } = resolve(input.modelId);
  if (!provider.translatePrompt) throw errors.unsupported('当前模型不支持提示词翻译');
  try {
    return await provider.translatePrompt(
      { text: input.text, to: input.to },
      ctxOf(model, input.req, input.userId, 'translate'),
    );
  } catch (e) {
    return surface(e);
  }
}
