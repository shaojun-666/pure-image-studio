import type { ProviderErrorShape } from './types';

/** 归一化错误码 → 是否值得重试 */
const RETRYABLE: Record<string, boolean> = {
  timeout: true,
  rate_limited: true,
  upstream_error: true,
  network: true,
  // 下面这些重试也没用，立即退款
  content_filtered: false,
  invalid_request: false,
  auth_failed: false,
  not_found: false,
  unknown: false,
};

export class ProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly raw?: unknown;

  constructor(
    code: keyof typeof RETRYABLE | string,
    message: string,
    opts: { httpStatus?: number; raw?: unknown; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = opts.retryable ?? RETRYABLE[code] ?? false;
    this.httpStatus = opts.httpStatus;
    this.raw = opts.raw;
  }
}

export function toProviderErrorShape(e: unknown): ProviderErrorShape {
  if (e instanceof ProviderError) {
    return {
      code: e.code,
      message: e.message,
      retryable: e.retryable,
      httpStatus: e.httpStatus,
      raw: e.raw,
    };
  }
  // AbortSignal 触发
  if (e instanceof Error && e.name === 'AbortError') {
    return { code: 'timeout', message: '上游超时', retryable: true };
  }
  return {
    code: 'unknown',
    message: e instanceof Error ? e.message : String(e),
    retryable: false,
  };
}
