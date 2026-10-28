import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAYS = 14;

/**
 * 用量统计：近 14 天的净消耗 + 累计收支。
 *
 * 按「北京时间的自然日」分桶必须交给数据库算 —— 服务器时区是 UTC，
 * 拿 JS 按本地时间切会把当天 08:00 之前的消耗算到前一天去。
 * `AT TIME ZONE 'Asia/Shanghai'` 把 timestamptz 换成当地墙上时间再切日。
 */
export const GET = route(async () => {
  const user = await requireUser();

  const [daily, totals, generations, images] = await Promise.all([
    prisma.$queryRaw<{ day: string; spent: number }[]>`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD') AS day,
             -SUM("delta")::int AS spent
      FROM "CreditLedger"
      WHERE "userId" = ${user.id}
        AND "kind" IN ('GENERATION_HOLD', 'GENERATION_SETTLE', 'GENERATION_REFUND')
        AND "createdAt" >= now() - ${`${DAYS} days`}::interval
      GROUP BY 1
    `,
    prisma.creditLedger.groupBy({
      by: ['kind'],
      where: { userId: user.id },
      _sum: { delta: true },
    }),
    prisma.generation.count({ where: { userId: user.id } }),
    prisma.generationImage.count({ where: { userId: user.id, status: 'SUCCEEDED' } }),
  ]);

  const byDay = new Map(daily.map((d) => [d.day, Number(d.spent)]));

  // 补齐没有消耗的日子，否则图表会把「空天」直接省略，看趋势会产生错觉
  const days: { day: string; spent: number }[] = [];
  const today = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    // en-CA 的短日期恰好是 YYYY-MM-DD，省掉手写补零
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(d);
    days.push({ day: key, spent: byDay.get(key) ?? 0 });
  }

  const totalEarned = totals.reduce(
    (n, g) => (g._sum.delta && g._sum.delta > 0 ? n + g._sum.delta : n),
    0,
  );
  const totalSpent = totals.reduce(
    (n, g) => (g._sum.delta && g._sum.delta < 0 ? n + g._sum.delta : n),
    0,
  );

  return ok({ days, totalEarned, totalSpent, generations, images });
});
