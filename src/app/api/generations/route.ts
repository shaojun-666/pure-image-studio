import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { cursorArgs, slicePage } from '@/server/pagination';
import { serializeGeneration, serializeImage } from '@/server/generation/queries';
import { GENERATION_MODES, MODE_TO_DB } from '@/lib/ai/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(48).default(20),
  mode: z.enum(GENERATION_MODES).optional(),
  modelId: z.string().optional(),
  status: z.string().optional(),
  favorited: z.enum(['0', '1']).optional(),
});

/** 生成历史（游标分页）。列表页只回缩略图，原图点进详情才取。 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams));

  // 图片侧的两个条件是 AND 关系，必须合进同一个 `some` 里 ——
  // 写成两个 images 键会互相覆盖，收藏筛选静默失效。
  const imageFilter = {
    deletedAt: null,
    ...(q.favorited === '1' ? { favorites: { some: { userId: user.id } } } : {}),
  };

  const rows = await prisma.generation.findMany({
    where: {
      userId: user.id,
      ...(q.mode ? { mode: MODE_TO_DB[q.mode] } : {}),
      ...(q.modelId ? { modelId: q.modelId } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      // 全部图都被软删的生成不该出现在历史里
      images: { some: imageFilter },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...cursorArgs(q.cursor, q.limit),
    include: {
      images: { where: { deletedAt: null }, orderBy: { index: 'asc' } },
    },
  });

  const page = slicePage(rows, q.limit);

  const imageIds = page.items.flatMap((g) => g.images.map((i) => i.id));
  const favs = imageIds.length
    ? await prisma.favorite.findMany({
        where: { userId: user.id, imageId: { in: imageIds } },
        select: { imageId: true },
      })
    : [];
  const favSet = new Set(favs.map((f) => f.imageId));

  const items = await Promise.all(
    page.items.map(async (g) => ({
      ...serializeGeneration(g),
      images: await Promise.all(
        g.images.map((i) => serializeImage(i, favSet.has(i.id))),
      ),
    })),
  );

  return ok({ items, nextCursor: page.nextCursor });
});
