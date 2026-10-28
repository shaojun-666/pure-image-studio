import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { cursorArgs, slicePage } from '@/server/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kind: z
    .enum([
      'SIGNUP_BONUS',
      'DAILY_GRANT',
      'ADMIN_GRANT',
      'GENERATION_HOLD',
      'GENERATION_SETTLE',
      'GENERATION_REFUND',
      'ADJUSTMENT',
    ])
    .optional(),
});

/** 积分流水。只读、只出当前用户的，cursor 是行 id（配合 createdAt desc, id desc 才是稳定游标）。 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams));

  const rows = await prisma.creditLedger.findMany({
    where: { userId: user.id, ...(q.kind ? { kind: q.kind } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...cursorArgs(q.cursor, q.limit),
    select: {
      id: true,
      kind: true,
      delta: true,
      balanceAfter: true,
      grossCost: true,
      modelId: true,
      generationId: true,
      reason: true,
      createdAt: true,
    },
  });

  return ok(
    slicePage(
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      q.limit,
    ),
  );
});
