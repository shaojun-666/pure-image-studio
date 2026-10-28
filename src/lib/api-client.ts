import type { ApiErrorCode, ApiResponse } from '@/types/api';

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * 所有客户端请求都走这里：解开 { ok, data } 信封，失败一律抛 ApiClientError。
 * 调用方只需 catch (e) 后取 e.code 决定文案，不用重复判断 res.ok。
 */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: {
        // 只对字符串体声明 JSON。FormData 必须让浏览器自己带 boundary，
        // 手写 content-type 会让 multipart 解析直接失败。
        ...(typeof init?.body === 'string'
          ? { 'content-type': 'application/json' }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiClientError('NETWORK_ERROR', '网络异常', 0);
  }

  let json: ApiResponse<T> | undefined;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    // 网关/代理返回了非 JSON
  }

  if (!json) {
    throw new ApiClientError('INTERNAL_ERROR', `HTTP ${res.status}`, res.status);
  }
  if (!json.ok) {
    throw new ApiClientError(json.error.code, json.error.message, res.status, json.error.details);
  }
  return json.data;
}
