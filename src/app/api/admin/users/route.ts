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
  q: z.string().trim().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const q = query.parse(Object.fromEntries(url.searchParams));

  const rows = await prisma.user.findMany({
    where: {
      ...(q.role ? { role: q.role } : {}),
      ...(q.q ? { email: { contains: q.q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...cursorArgs(q.cursor, q.limit),
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      creditBalance: true,
      createdAt: true,
      lastLoginAt: true,
      _count: { select: { generations: true } },
    },
  });

  return ok(
    slicePage(
      rows.map(({ _count, createdAt, lastLoginAt, ...u }) => ({
        ...u,
        generationCount: _count.generations,
        createdAt: createdAt.toISOString(),
        lastLoginAt: lastLoginAt?.toISOString() ?? null,
      })),
      q.limit,
    ),
  );
});
