import { prisma } from '@/server/db';

/**
 * 后台看板聚合。按北京日切分 —— 服务器时区是 UTC，
 * 直接 group by date_trunc('day', "createdAt") 会把当地 08:00 之后的数据算到前一天。
 */
const DAYS = 14;

export async function adminStats() {
  const since = new Date(Date.now() - DAYS * 86_400_000);

  const [users, generations, images, published, byStatus, ledger, series, recent] =
    await Promise.all([
      prisma.user.count(),
      prisma.generation.count(),
      prisma.generationImage.count({ where: { deletedAt: null } }),
      prisma.explorePost.count({ where: { status: 'PUBLISHED' } }),
      prisma.generation.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.creditLedger.aggregate({
        _sum: { delta: true },
        where: { kind: { in: ['GENERATION_SETTLE', 'GENERATION_HOLD', 'GENERATION_REFUND'] } },
      }),
      prisma.$queryRaw<{ day: string; generations: number; images: number }[]>`
        SELECT to_char(date_trunc('day', g."createdAt" AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD') AS day,
               COUNT(DISTINCT g."id")::int AS generations,
               COUNT(i."id")::int          AS images
        FROM "Generation" g
        LEFT JOIN "GenerationImage" i ON i."generationId" = g."id" AND i."deletedAt" IS NULL
        WHERE g."createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1`,
      prisma.generation.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: {
          id: true,
          status: true,
          mode: true,
          modelId: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
    ]);

  const statusCounts: Record<string, number> = {};
  for (const s of byStatus) statusCounts[s.status] = s._count._all;

  // 补齐没有数据的日期，否则图表会把「空天」直接省略、把 14 天挤成 5 根柱子
  const byDay = new Map(series.map((d) => [d.day, d]));
  const days = Array.from({ length: DAYS }, (_, i) => {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
      new Date(Date.now() - (DAYS - 1 - i) * 86_400_000),
    );
    return byDay.get(key) ?? { day: key, generations: 0, images: 0 };
  });

  return {
    totals: {
      users,
      generations,
      images,
      publishedPosts: published,
      // 净消耗：HOLD/SETTLE/REFUND 三类相加，退款是正数所以自动抵掉
      creditsSpent: Math.abs(ledger._sum.delta ?? 0),
    },
    statusCounts,
    days,
    recentGenerations: recent.map((g) => ({
      id: g.id,
      status: g.status,
      mode: g.mode,
      modelId: g.modelId,
      email: g.user.email,
      createdAt: g.createdAt.toISOString(),
    })),
  };
}

export type AdminStatsDTO = Awaited<ReturnType<typeof adminStats>>;
