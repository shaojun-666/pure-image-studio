import { timingSafeEqual } from 'node:crypto';
import { reconcileBalances } from '@/server/credits/reconcile';
import { env } from '@/server/env';
import { fail, ok } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 定长比较，别用 !== —— 那是逐字节短路，理论上能被计时探出前缀 */
function secretMatches(given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * 夜间对账：用流水 SUM(delta) 校验余额缓存，发现漂移就写 ADJUSTMENT 修正并留痕。
 * 由 compose 里的 cron 容器定时调用；面向内部，用共享密钥拦，不走用户鉴权。
 *
 * ★ CRON_SECRET 在生产环境是**必填**的（见 env.ts）：从前它有个
 *   默认值 'dev-cron-secret'，生产上忘了配就是任何人拿这个公开串
 *   都能触发全量对账（重活 + 拿锁）。
 */
export async function POST(req: Request) {
  if (!secretMatches(req.headers.get('x-cron-secret'))) {
    return fail('FORBIDDEN', '无效的 cron 密钥', 403);
  }

  const result = await reconcileBalances({ fix: true });
  return ok(result);
}
