import { requireUser } from '@/server/auth/guards';
import { serializeGeneration, serializeImage } from '@/server/generation/queries';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { errors } from '@/types/api';

export const runtime = 'nodejs';

export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const gen = await prisma.generation.findFirst({
      where: { id, userId: user.id },
    });
    if (!gen) throw errors.notFound('生成记录不存在');

    const rows = await prisma.generationImage.findMany({
      where: { generationId: id },
      orderBy: { index: 'asc' },
    });

    const favs = await prisma.favorite.findMany({
      where: { userId: user.id, imageId: { in: rows.map((r) => r.id) } },
      select: { imageId: true },
    });
    const favSet = new Set(favs.map((f) => f.imageId));

    return ok({
      ...serializeGeneration(gen),
      images: await Promise.all(
        rows.map((r) => serializeImage(r, favSet.has(r.id))),
      ),
    });
  },
);
