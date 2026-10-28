import { errors } from '@/types/api';
import { prisma } from './db';

/**
 * DB 滑动窗口限流 —— 不为一个计数引入 Redis。
 * 只统计真正落库的提交：参数非法的请求本来就不会消耗上游资源。
 */
export async function assertRateLimit(
  userId: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  if (limit <= 0) return;
  const used = await prisma.generation.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - windowMs) } },
  });
  if (used >= limit) {
    throw errors.rateLimited(`提交过于频繁，${windowMs / 60000} 分钟内最多 ${limit} 次`);
  }
}

/** 提示词润色 / 翻译这类不落 Generation 表的接口，每 5 分钟的次数上限 */
export const PROMPT_CALLS_PER_5MIN = 30;

/**
 * 进程内滑动窗口，给**不落 Generation 表**的轻量接口用（润色 / 翻译）。
 *
 * ★ 为什么不复用上面那个 DB 版本：它是靠 count(Generation) 实现的，
 *   而润色不写 Generation，套上去恒为 0 次，等于没限流 ——
 *   原注释写着「真实厂商的调用配额控制随 provider 一起做」，
 *   但 provider 那层只有超时，没有配额，于是这条路一直是敞开的：
 *   登录用户循环打 /api/prompt/enhance 就能把百炼的文本额度烧光，
 *   而额度耗尽后 dashscope 会把所有人生成失败映射成「免费额度已用尽」。
 *
 * ★ 代价说清楚：这是**单进程**计数。应用是一个容器一个 node 进程，
 *   够用；哪天横向扩了必须换成共享存储，否则配额按进程数翻倍。
 */
const bursts = new Map<string, number[]>();

export function assertBurst(key: string, limit: number, windowMs: number): void {
  if (limit <= 0) return;
  const now = Date.now();
  const hits = (bursts.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= limit) {
    throw errors.rateLimited(
      `操作过于频繁，${Math.round(windowMs / 60000)} 分钟内最多 ${limit} 次`,
    );
  }
  hits.push(now);
  bursts.set(key, hits);

  // 顺手清掉整体过期的键，避免 Map 随用户数无界增长
  if (bursts.size > 5000) {
    for (const [k, v] of bursts) {
      if (v.every((t) => t <= now - windowMs)) bursts.delete(k);
    }
  }
}
