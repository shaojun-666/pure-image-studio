import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 浏览量 +1。刻意不做去重也不校验是否存在 —— 这是一个统计口径很松的展示数字，
 * 为此加一张浏览记录表不值得。前端只在详情页挂载时调一次。
 */
export const POST = route(
  async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    await prisma.explorePost
      .update({ where: { slug }, data: { viewCount: { increment: 1 } } })
      .catch(() => null);
    return ok({ slug });
  },
);
