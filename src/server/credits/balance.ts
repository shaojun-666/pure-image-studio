import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { errors } from '@/types/api';
import { appendLedger, lockUserBalance } from './ledger';
import { writeAudit } from '@/server/admin/audit';

/**
 * 提交时冻结积分。必须在调用方的事务里执行 ——
 * Generation 的 INSERT 与扣费要么一起成功，要么一起回滚（余额不足时不能留下半条记录）。
 */
export async function holdCredits(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    amount: number;
    generationId: string;
    modelId: string;
  },
): Promise<{ balance: number }> {
  const balance = await lockUserBalance(tx, input.userId);
  if (balance === null) throw errors.notFound('用户不存在');
  if (balance < input.amount) {
    throw errors.insufficientCredits(input.amount - balance);
  }

  const entry = await appendLedger(tx, {
    userId: input.userId,
    kind: 'GENERATION_HOLD',
    delta: -input.amount,
    balanceAfter: balance - input.amount,
    grossCost: input.amount,
    generationId: input.generationId,
    modelId: input.modelId,
    idempotencyKey: `hold:${input.generationId}`,
  });
  // 已扣过（重试）→ 幂等返回当前余额
  if (!entry) return { balance };

  await tx.user.update({
    where: { id: input.userId },
    data: { creditBalance: balance - input.amount },
  });
  return { balance: balance - input.amount };
}

/**
 * 结算。只追加补偿行，永不修改或删除 HOLD 行 ——
 * 流水因此是完整历史：HOLD -40 → REFUND +32 一眼看得懂。
 */
export async function settleGeneration(input: {
  generationId: string;
  costPerImage: number;
  succeededCount: number;
  batchCount: number;
}): Promise<{ spent: number; refunded: number; balance: number }> {
  const { generationId, costPerImage, succeededCount } = input;
  const spent = costPerImage * succeededCount;

  return prisma.$transaction(
    async (tx) => {
      const gen = await tx.generation.findUnique({
        where: { id: generationId },
        select: { userId: true, creditsHeld: true },
      });
      if (!gen) throw errors.notFound('生成记录不存在');

      const refunded = Math.max(0, gen.creditsHeld - spent);
      const balance = await lockUserBalance(tx, gen.userId);
      if (balance === null) throw errors.notFound('用户不存在');

      // 幂等哨兵：结算只应发生一次
      const settled = await appendLedger(tx, {
        userId: gen.userId,
        kind: 'GENERATION_SETTLE',
        delta: 0,
        balanceAfter: balance,
        grossCost: spent,
        generationId,
        idempotencyKey: `settle:${generationId}`,
      });
      if (!settled) {
        return { spent, refunded: 0, balance };
      }

      if (refunded > 0) {
        await appendLedger(tx, {
          userId: gen.userId,
          kind: 'GENERATION_REFUND',
          delta: refunded,
          balanceAfter: balance + refunded,
          generationId,
          reason: `${input.batchCount - succeededCount} 张未成功，退回积分`,
          idempotencyKey: `refund:${generationId}`,
        });
        await tx.user.update({
          where: { id: gen.userId },
          data: { creditBalance: balance + refunded },
        });
      }

      return {
        spent,
        refunded,
        balance: balance + refunded,
      };
    },
    { isolationLevel: 'ReadCommitted', timeout: 10_000 },
  );
}

/**
 * 后台手动发放。
 * 审计与发放必须在同一事务里 —— 「钱发出去了但没人知道是谁发的」是后台最不该出现的事。
 */
export async function adminGrant(input: {
  userId: string;
  amount: number;
  adminId: string;
  reason: string;
  ip?: string | null;
}): Promise<{ balance: number }> {
  const { userId, amount, adminId, reason, ip } = input;
  return prisma.$transaction(async (tx) => {
    const balance = await lockUserBalance(tx, userId);
    if (balance === null) throw errors.notFound('用户不存在');

    await appendLedger(tx, {
      userId,
      kind: 'ADMIN_GRANT',
      delta: amount,
      balanceAfter: balance + amount,
      adminId,
      reason,
      // 每次发放都是一笔独立流水，所以这里带上时间戳（不像 hold/refund 是幂等补偿行）
      idempotencyKey: `admingrant:${adminId}:${userId}:${Date.now()}`,
    });

    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: balance + amount },
    });

    await writeAudit(tx, {
      adminId,
      action: 'user.grantCredits',
      targetType: 'User',
      targetId: userId,
      diff: { amount, reason, balanceAfter: balance + amount },
      ip,
    });

    return { balance: balance + amount };
  });
}
