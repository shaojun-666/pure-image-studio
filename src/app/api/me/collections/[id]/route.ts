import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { cursorArgs, slicePage } from '@/server/pagination';
import { serializeImage } from '@/server/generation/queries';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 归属校验。不是自己的也回 404 而不是 403——
 * 回 403 等于确认「这个 id 存在」，没必要泄漏。
 */
async function ownCollection(userId: string, id: string) {
  const collection = await prisma.collection.findFirst({ where: { id, userId } });
  if (!collection) throw errors.notFound('集合不存在');
  return collection;
}

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

export const GET = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const collection = await ownCollection(user.id, id);

    const url = new URL(req.url);
    const q = querySchema.parse(Object.fromEntries(url.searchParams));

    // 软删的图不算数——集合的「张数」和这里列出来的必须一致
    const rows = await prisma.collectionItem.findMany({
      where: { collectionId: id, image: { deletedAt: null } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      ...cursorArgs(q.cursor, q.limit),
      include: { image: true },
    });

    const page = slicePage(rows, q.limit);

    const favs = page.items.length
      ? await prisma.favorite.findMany({
          where: {
            userId: user.id,
            imageId: { in: page.items.map((r) => r.imageId) },
          },
          select: { imageId: true },
        })
      : [];
    const favSet = new Set(favs.map((f) => f.imageId));

    return ok({
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        itemCount: collection.itemCount,
        updatedAt: collection.updatedAt.toISOString(),
      },
      items: await Promise.all(
        page.items.map((r) => serializeImage(r.image, favSet.has(r.imageId))),
      ),
      nextCursor: page.nextCursor,
    });
  },
);

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(200).nullable().optional(),
});

export const PATCH = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownCollection(user.id, id);

    const body = patchSchema.parse(await req.json());

    // 传了空串等于清空描述，没传则不动——靠 undefined / '' 区分
    const updated = await prisma.collection.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description || null }
          : {}),
      },
    });

    return ok({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      itemCount: updated.itemCount,
      updatedAt: updated.updatedAt.toISOString(),
    });
  },
);

/** CollectionItem 有 onDelete: Cascade，删集合就带走了，不用手动清 */
export const DELETE = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownCollection(user.id, id);

    await prisma.collection.delete({ where: { id } });
    return ok({ deleted: true });
  },
);
