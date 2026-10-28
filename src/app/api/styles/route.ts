import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { auth } from '@/server/auth';
import { cursorArgs, slicePage, PAGE_SIZE } from '@/server/pagination';
import { storage } from '@/server/storage';

export const runtime = 'nodejs';

const querySchema = z.object({
  category: z.string().optional(),
  q: z.string().trim().max(60).optional(),
  /** '1' = 只看我保存的风格 */
  mine: z.enum(['0', '1']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(60).default(PAGE_SIZE),
});

/** 风格画廊。`mine` 需要登录，其余匿名可访问。 */
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams));

  let ownerUserId: string | undefined;
  if (q.mine === '1') {
    const session = await auth();
    if (!session?.user?.id) return ok({ items: [], nextCursor: null });
    ownerUserId = session.user.id;
  } else {
    // 精选风格（ownerUserId 为空）；分类/搜索在库侧过滤
  }

  const rows = await prisma.stylePreset.findMany({
    where: {
      enabled: true,
      ...(ownerUserId ? { ownerUserId } : { ownerUserId: null, isCurated: true }),
      ...(q.category && q.category !== 'all'
        ? { category: q.category as never }
        : {}),
      ...(q.q
        ? {
            OR: [
              { slug: { contains: q.q, mode: 'insensitive' as const } },
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
      nameI18n: true,
      category: true,
      tags: true,
      thumbnailKey: true,
      promptSuffix: true,
      negativeSuffix: true,
      defaultParams: true,
      recommendedModelId: true,
      ownerUserId: true,
    },
  });

  // 与 explore 封面同一套：public/* 的 key 由 storage 解析成可取用的 URL。
  // 前端不能自己拼 `/` + key —— 本地驱动下这些字节在 .data/storage 里，不是 Next 的 public 目录。
  return ok(
    slicePage(
      rows.map(({ thumbnailKey, ...s }) => ({ ...s, thumbnailUrl: storage.publicUrl(thumbnailKey) })),
      q.limit,
    ),
  );
});
