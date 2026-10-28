import { prisma } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import { appendLedger, isUniqueViolation, lockUserBalance } from './ledger';

/** 'YYYY-MM-DD'，按 Asia/Shanghai 计算，与宿主机时区无关 */
export function beijingDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** 下一次日界（北京时间零点）的时刻 */
export function nextBeijingMidnight(from: Date = new Date()): Date {
  const today = beijingDayKey(from);
  // 猜一个 UTC 时刻，再回推校正
  const guess = new Date(`${today}T00:00:00+08:00`);
  guess.setUTCDate(guess.getUTCDate() + 1);
  return guess;
}

/**
 * 领取当日免费积分。幂等：重复调用只在当天首次生效。
 * 不累积是结构性的 —— 只写当天一行，昨天那行永远不会被读。
 */
export async function claimDailyGrant(
  userId: string,
): Promise<{ granted: number; balance: number }> {
  const day = beijingDayKey();
  const amount = env.DAILY_FREE_CREDITS;

  return prisma.$transaction(async (tx) => {
    const balance = await lockUserBalance(tx, userId);
    if (balance === null) throw new Error(`user not found: ${userId}`);

    try {
      await tx.dailyGrant.create({ data: { userId, day, amount } });
    } catch (e) {
      if (isUniqueViolation(e)) return { granted: 0, balance };
      throw e;
    }

    const entry = await appendLedger(tx, {
      userId,
      kind: 'DAILY_GRANT',
      delta: amount,
      balanceAfter: balance + amount,
      reason: `每日免费额度 ${day}`,
      idempotencyKey: `grant:${userId}:${day}`,
    });

    // 理论上不可能：dayKey 唯一约束已经挡住了重复
    if (!entry) return { granted: 0, balance };

    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: balance + amount },
    });
    await tx.dailyGrant.update({
      where: { userId_day: { userId, day } },
      data: { ledgerId: entry.id },
    });

    logger.info('daily grant claimed', { userId, day, amount });
    return { granted: amount, balance: balance + amount };
  });
}
