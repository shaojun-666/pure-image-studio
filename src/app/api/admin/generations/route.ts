import { z } from 'zod';
import { prisma } from '@/server/db';
import { requireAdmin } from '@/server/auth/guards';
import { ok, route } from '@/server/http';
import { cursorArgs, slicePage, PAGE_SIZE } from '@/server/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const query = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  /** 默认只看失败的：这个页面的用途就是排查，全量列表没人看 */
  status: z
    .enum(['PENDING', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED'])
    .optional()
    .default('FAILED'),
  q: z.string().trim().optional(),
});

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const q = query.parse(Object.fromEntries(url.searchParams));

  const rows = await prisma.generation.findMany({
    where: {
      status: q.status,
      ...(q.q
        ? {
            OR: [
              { errorCode: { contains: q.q, mode: 'insensitive' as const } },
              { prompt: { contains: q.q, mode: 'insensitive' as const } },
              { user: { email: { contains: q.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...cursorArgs(q.cursor, q.limit),
    select: {
      id: true,
      status: true,
      mode: true,
      modelId: true,
      prompt: true,
      errorCode: true,
      errorMessage: true,
      attempts: true,
      creditsHeld: true,
      creditsSpent: true,
      creditsRefunded: true,
      succeededCount: true,
      failedCount: true,
      batchCount: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  });

  return ok(
    slicePage(
      rows.map(({ user, createdAt, ...g }) => ({
        ...g,
        email: user.email,
        createdAt: createdAt.toISOString(),
      })),
      q.limit,
    ),
  );
});
