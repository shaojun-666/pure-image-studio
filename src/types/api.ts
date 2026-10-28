/** 全部 API 的统一响应外壳 */

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_CREDITS'
  | 'UNSUPPORTED_FEATURE'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'CONFLICT'
  | 'PROVIDER_ERROR'
  | 'CONTENT_FILTERED'
  | 'INTERNAL_ERROR';

export type ApiResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: ApiErrorCode; message: string; details?: unknown };
    };

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  unauthorized: (m = '请先登录') => new AppError('UNAUTHORIZED', m, 401),
  forbidden: (m = '没有权限') => new AppError('FORBIDDEN', m, 403),
  notFound: (m = '资源不存在') => new AppError('NOT_FOUND', m, 404),
  validation: (m = '参数有误', d?: unknown) =>
    new AppError('VALIDATION_ERROR', m, 422, d),
  insufficientCredits: (short: number) =>
    new AppError('INSUFFICIENT_CREDITS', `积分不足，还差 ${short}`, 402, { short }),
  unsupported: (m: string) => new AppError('UNSUPPORTED_FEATURE', m, 422),
  rateLimited: (m = '操作过于频繁，请稍后再试') =>
    new AppError('RATE_LIMITED', m, 429),
  modelNotFound: (id: string) =>
    new AppError('MODEL_NOT_FOUND', `模型不存在或已下架：${id}`, 404),
  conflict: (m: string) => new AppError('CONFLICT', m, 409),
  internal: (m = '服务器内部错误') => new AppError('INTERNAL_ERROR', m, 500),
};
