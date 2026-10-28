import type { Generation } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';

const MAX_ATTEMPTS = 3;

/**
 * 领取一个待办任务。
 *
 * 这一段 SKIP LOCKED 就是 Redis + 消息队列的替代品，顺带把崩溃恢复也解决了：
 *   1. PENDING/QUEUED 且到点      → 首次执行
 *   2. RUNNING 且 nextPollAt 到点 → 异步轮询
 *   3. RUNNING 且租约过期的同步任务 → worker 挂了，重领（占一次 attempts）
 *   4. RUNNING 且租约过期的异步任务 → worker 挂了，重新轮询（不占 attempts）
 *
 * attempts 只在「即将提交」时自增：轮询几十次不该把重试预算耗光。
 */
export async function claimOne(workerId: string): Promise<Generation | null> {
  const leaseSecs = Math.ceil(env.LEASE_TTL_MS / 1000);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; willSubmit: boolean; startedAt: Date | null }[]
    >`
      SELECT id,
             ("providerJobId" IS NULL) AS "willSubmit",
             "startedAt"
      FROM "Generation"
      WHERE
        (status IN ('PENDING', 'QUEUED')
          AND ("nextPollAt" IS NULL OR "nextPollAt" <= now())
          AND attempts < ${MAX_ATTEMPTS})
        OR (status = 'RUNNING'
          AND "nextPollAt" IS NOT NULL
          AND "nextPollAt" <= now())
        OR (status = 'RUNNING'
          AND "providerJobId" IS NULL
          AND "lockedAt" < now() - (${leaseSecs} * interval '1 second')
          AND attempts < ${MAX_ATTEMPTS})
        OR (status = 'RUNNING'
          AND "providerJobId" IS NOT NULL
          AND "lockedAt" < now() - (${leaseSecs} * interval '1 second'))
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;

    if (!rows.length) return null;
    const row = rows[0];

    return tx.generation.update({
      where: { id: row.id },
      data: {
        status: 'RUNNING',
        lockedAt: new Date(),
        lockedBy: workerId,
        // 首次领取才记开始时间，重试不重置（deadline 从第一次算起）
        startedAt: row.startedAt ?? new Date(),
        nextPollAt: null,
        attempts: row.willSubmit ? { increment: 1 } : undefined,
      },
    });
  });
}
