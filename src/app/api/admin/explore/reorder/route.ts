import { z } from 'zod';
import { prisma } from '@/server/db';
import { requireAdmin } from '@/server/auth/guards';
import { writeAudit } from '@/server/admin/audit';
import { ok, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  /** 按目标顺序排列的 id 列表，服务端按下标重写 sortOrder */
  ids: z.array(z.string().min(1)).min(1).max(500),
});

/**
 * 重排探索内容。整批按数组下标写 sortOrder（步长 10，给日后插队留空档），
 * 与审计同事务 —— 拖拽顺序是运营最常改又最难追溯的操作。
 */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const { ids } = schema.parse(await req.json());

  const found = await prisma.explorePost.count({ where: { id: { in: ids } } });
  if (found !== ids.length) {
    return ok({ updated: 0, skipped: ids.length - found });
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      ids.map((id, i) =>
        tx.explorePost.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } }),
      ),
    );
    await writeAudit(tx, {
      adminId: admin.id,
      action: 'explore.reorder',
      targetType: 'ExplorePost',
      targetId: ids[0],
      diff: { count: ids.length, ids },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });
  });

  return ok({ updated: ids.length, skipped: 0 });
});
