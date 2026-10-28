import type {
  GenerateRequest,
  GeneratedImage,
  GenerationMode,
  ModelDescriptor,
} from '@/lib/ai/contracts';

export interface ProviderLogger {
  debug(m: string, x?: unknown): void;
  info(m: string, x?: unknown): void;
  warn(m: string, x?: unknown): void;
  error(m: string, x?: unknown): void;
}

export interface ProviderContext {
  signal: AbortSignal;
  model: ModelDescriptor;
  requestId: string;
  userId: string;
  logger: ProviderLogger;
}

/**
 * 只做一个 submit，不做 9 个模式方法。
 * 能力开关已经告诉 UI 什么能用，9 个方法 × N 厂商 = 9N 个空桩。
 */
export type SubmitResult =
  | {
      kind: 'sync';
      images: GeneratedImage[];
      providerJobId?: string;
      raw?: unknown;
    }
  | {
      kind: 'async';
      providerJobId: string;
      pollAfterMs: number;
      estimatedTotalMs?: number;
    };

export type PollResult =
  | {
      status: 'running';
      progress?: number;
      retryAfterMs?: number;
    }
  | { status: 'succeeded'; images: GeneratedImage[]; raw?: unknown }
  | { status: 'failed'; error: ProviderErrorShape };

export interface ProviderErrorShape {
  code: string;
  message: string;
  retryable: boolean;
  httpStatus?: number;
  raw?: unknown;
}

export interface ImageProvider {
  /** === Generation.providerKey */
  readonly key: string;
  /** 启动时摊平进模型目录 */
  readonly models: readonly ModelDescriptor[];
  submit(req: GenerateRequest, ctx: ProviderContext): Promise<SubmitResult>;
  /** 仅 capabilities.async 的模型需要实现 */
  poll?(
    handle: { providerJobId: string },
    ctx: ProviderContext,
  ): Promise<PollResult>;
  cancel?(handle: { providerJobId: string }, ctx: ProviderContext): Promise<void>;
  /** 返回文字而非像素，因此单独列出 */
  enhancePrompt?(
    input: { prompt: string; mode: GenerationMode; locale: string; styleHint?: string },
    ctx: ProviderContext,
  ): Promise<{ enhancedPrompt: string; negativePrompt?: string }>;
  translatePrompt?(
    input: { text: string; from?: string; to: string },
    ctx: ProviderContext,
  ): Promise<{ text: string }>;
}
