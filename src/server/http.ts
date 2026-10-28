import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, type ApiResponse } from '@/types/api';
import { logger } from './logger';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, init);
}

export function fail(
  code: AppError['code'],
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json<ApiResponse<never>>(
    { ok: false, error: { code, message, details } },
    { status },
  );
}

/** 把抛出的异常统一翻译成响应外壳 */
export function toErrorResponse(e: unknown) {
  if (e instanceof AppError) {
    return fail(e.code, e.message, e.status, e.details);
  }
  if (e instanceof ZodError) {
    return fail('VALIDATION_ERROR', '参数有误', 422, e.issues);
  }
  logger.error('unhandled route error', {
    message: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  });
  return fail('INTERNAL_ERROR', '服务器内部错误', 500);
}

/** 路由处理器的错误边界包装 */
export function route<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}
