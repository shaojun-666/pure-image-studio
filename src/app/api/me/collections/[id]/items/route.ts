import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ownCollection(userId: string, id: string) {
  const collection = await prisma.collection.findFirst({ where: { id, userId } });
  if (!collection) throw errors.notFound('集合不存在');
  return collection;
}

/**
 * `itemCount` 和 `coverImageId` 都是冗余字段。这里统一用「重算」而不是 increment：
 * 重复提交（或 skipDuplicates 吃掉几行）会让加减法跑偏，而重算一次 count 加取一张图
 * 的成本可以忽略。张数的口径与详情页一致——只算未软删的图。
 */
async function refresh(collectionId: string) {
  const where = { collectionId, image: { deletedAt: null } };
  const [itemCount, first] = await Promise.all([
    prisma.collectionItem.count({ where }),
    prisma.collectionItem.findFirst({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { imageId: true },
    }),
  ]);

  await prisma.collection.update({
    where: { id: collectionId },
    data: { itemCount, coverImageId: first?.imageId ?? null },
  });
}

const idsSchema = z.object({
  imageIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { imageIds } = idsSchema.parse(await req.json());

    await ownCollection(user.id, id);

    // 只认自己的、没软删的图。别人 id 混进来直接丢掉，不报错——
    // 批量加图时前端很难保证每张都还有效，为此整批失败不划算。
    const owned = await prisma.generationImage.findMany({
      where: { id: { in: imageIds }, userId: user.id, deletedAt: null },
      select: { id: true },
    });

    // skipDuplicates 让「重复加入」天然幂等，不必先查一遍
    const { count } = await prisma.collectionItem.createMany({
      data: owned.map((i) => ({ collectionId: id, imageId: i.id })),
      skipDuplicates: true,
    });

    await refresh(id);
    return ok({ added: count });
  },
);

/**
 * 批量移出用 DELETE + body。这样加图和移出是同一个 URL、同一份入参形状，
 * 前端两个 mutation 只差一个 method。
 */
export const DELETE = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { imageIds } = idsSchema.parse(await req.json());

    await ownCollection(user.id, id);

    const { count } = await prisma.collectionItem.deleteMany({
      where: { collectionId: id, imageId: { in: imageIds } },
    });

    await refresh(id);
    return ok({ removed: count });
  },
);
