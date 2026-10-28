import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { cursorArgs, slicePage, PAGE_SIZE } from '@/server/pagination';

export const runtime = 'nodejs';

const querySchema = z.object({
  category: z.string().optional(),
  q: z.string().trim().max(60).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(60).default(PAGE_SIZE),
});

/** 精选提示词库。正文只存英文——它是用户要复制走的产物，不参与本地化。 */
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams));

  const rows = await prisma.promptPreset.findMany({
    where: {
      enabled: true,
      isCurated: true,
      ownerUserId: null,
      ...(q.category && q.category !== 'all' ? { category: q.category } : {}),
      ...(q.q
        ? {
            OR: [
              { prompt: { contains: q.q, mode: 'insensitive' as const } },
              { tags: { has: q.q } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    ...cursorArgs(q.cursor, q.limit),
    select: {
      id: true,
      slug: true,
      titleI18n: true,
      prompt: true,
      negativePrompt: true,
      category: true,
      tags: true,
      recommendedModelId: true,
    },
  });

  return ok(slicePage(rows, q.limit));
});
