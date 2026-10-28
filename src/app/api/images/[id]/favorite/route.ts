import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { errors } from '@/types/api';

export const runtime = 'nodejs';

/**
 * 切换收藏。先删后插（或反之）而不是「查了再决定」——
 * `@@unique([userId, imageId])` 保证并发点击最多留下一行。
 * favoriteCount 是冗余计数，只用于探索页热度排序，允许轻微偏差。
 */
export const POST = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const image = await prisma.generationImage.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!image) throw errors.notFound('图片不存在');

    const existing = await prisma.favorite.findUnique({
      where: { userId_imageId: { userId: user.id, imageId: id } },
    });

    if (existing) {
      await prisma.$transaction([
        prisma.favorite.delete({ where: { id: existing.id } }),
        prisma.generationImage.update({
          where: { id },
          data: { favoriteCount: { decrement: 1 } },
        }),
      ]);
      return ok({ favorited: false });
    }

    await prisma.$transaction([
      prisma.favorite.create({ data: { userId: user.id, imageId: id } }),
      prisma.generationImage.update({
        where: { id },
        data: { favoriteCount: { increment: 1 } },
      }),
    ]);
    return ok({ favorited: true });
  },
);
