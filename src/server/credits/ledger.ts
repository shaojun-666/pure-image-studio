import type { LedgerKind, Prisma } from '@prisma/client';

export type LedgerWrite = {
  userId: string;
  kind: LedgerKind;
  /** 正为入、负为出 */
  delta: number;
  /** 该笔之后的余额快照 */
  balanceAfter: number;
  grossCost?: number;
  generationId?: string;
  modelId?: string;
  adminId?: string;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
  /** ★ 幂等的唯一依靠 */
  idempotencyKey: string;
};

export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  );
}

/**
 * 追加一条流水。必须在已锁住 User 行的事务里调用。
 * 命中 idempotencyKey 唯一约束时返回 null —— 表示这笔已经记过，调用方应当幂等返回。
 */
export async function appendLedger(
  tx: Prisma.TransactionClient,
  w: LedgerWrite,
) {
  try {
    return await tx.creditLedger.create({
      data: {
        userId: w.userId,
        kind: w.kind,
        delta: w.delta,
        balanceAfter: w.balanceAfter,
        grossCost: w.grossCost ?? 0,
        generationId: w.generationId,
        modelId: w.modelId,
        adminId: w.adminId,
        reason: w.reason,
        metadata: w.metadata,
        idempotencyKey: w.idempotencyKey,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return null;
    throw e;
  }
}

/** 锁住用户行并读出当前余额。同一用户的并发扣费在此串行化。 */
export async function lockUserBalance(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<number | null> {
  const rows = await tx.$queryRaw<{ creditBalance: number }[]>`
    SELECT "creditBalance" FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  return rows.length ? rows[0].creditBalance : null;
}
