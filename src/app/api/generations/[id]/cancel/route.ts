import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { errors } from '@/types/api';
import { settleGeneration } from '@/server/credits/balance';

export const runtime = 'nodejs';

/**
 * 取消尚未开始的生成并全额退款。
 *
 * 只有 PENDING/QUEUED 可取消：worker 已经领走的任务再撤回，
 * 会与正在写入的图片结果打架。用 updateMany 带状态条件来做原子抢占 ——
 * 先查再改的话，worker 可能刚好在这两步之间领走任务。
 */
export const POST = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const gen = await prisma.generation.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true, costPerImage: true, batchCount: true },
    });
    if (!gen) throw errors.notFound('生成记录不存在');

    const claimed = await prisma.generation.updateMany({
      where: { id, userId: user.id, status: { in: ['PENDING', 'QUEUED'] } },
      data: {
        status: 'CANCELED',
        finishedAt: new Date(),
        nextPollAt: null,
        lockedAt: null,
        lockedBy: null,
      },
    });

    if (claimed.count === 0) {
      throw errors.conflict(
        gen.status === 'RUNNING' ? '任务已开始执行，无法取消' : '任务已结束，无法取消',
      );
    }

    // 一张都没成功 → succeededCount 为 0，HOLD 全额退回
    const settled = await settleGeneration({
      generationId: id,
      costPerImage: gen.costPerImage,
      succeededCount: 0,
      batchCount: gen.batchCount,
    });

    return ok({ status: 'CANCELED', refunded: settled.refunded });
  },
);
