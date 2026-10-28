import { prisma } from '../db';
import { logger } from '../logger';
import { appendLedger, lockUserBalance } from './ledger';

export type Drift = { userId: string; cached: number; computed: number };

/**
 * 用流水 SUM(delta) 校验余额缓存。
 * 发现漂移时只写 ADJUSTMENT 行修正 —— 绝不静默改数，漂移必须留痕。
 */
export async function reconcileBalances(opts?: {
  fix?: boolean;
  userId?: string;
}): Promise<{ checked: number; drifted: Drift[] }> {
  const users = await prisma.user.findMany({
    where: opts?.userId ? { id: opts.userId } : undefined,
    select: { id: true, creditBalance: true },
  });

  const drifts: Drift[] = [];

  for (const u of users) {
    const agg = await prisma.creditLedger.aggregate({
      where: { userId: u.id },
      _sum: { delta: true },
    });
    const computed = agg._sum.delta ?? 0;

    if (computed !== u.creditBalance) {
      drifts.push({ userId: u.id, cached: u.creditBalance, computed });
      logger.warn('credit drift detected', {
        userId: u.id,
        cached: u.creditBalance,
        computed,
      });

      if (opts?.fix) {
        const delta = computed - u.creditBalance;
        await prisma.$transaction(async (tx) => {
          const balance = await lockUserBalance(tx, u.id);
          if (balance === null) return;
          await appendLedger(tx, {
            userId: u.id,
            kind: 'ADJUSTMENT',
            delta,
            balanceAfter: computed,
            reason: `对账修正：缓存 ${u.creditBalance} → 流水合计 ${computed}`,
            idempotencyKey: `adjust:${u.id}:${computed}:${Date.now()}`,
          });
          await tx.user.update({
            where: { id: u.id },
            data: { creditBalance: computed },
          });
        });
      }
    }
  }

  return { checked: users.length, drifted: drifts };
}
