import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 随机提示词。用 skip 随机偏移取一条 ——
 * 库只有几十条，`orderBy: random()` 在 Postgres 上是全表排序，杀鸡用牛刀。
 */
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');

  const where = {
    enabled: true,
    isCurated: true,
    ownerUserId: null,
    ...(category && category !== 'all' ? { category } : {}),
  };

  const total = await prisma.promptPreset.count({ where });
  if (total === 0) throw errors.notFound('提示词库为空');

  const rows = await prisma.promptPreset.findMany({
    where,
    skip: Math.floor(Math.random() * total),
    take: 1,
    select: {
      id: true,
      slug: true,
      titleI18n: true,
      prompt: true,
      negativePrompt: true,
      category: true,
    },
  });

  return ok(rows[0]);
});
