import { prisma } from '@/server/db';
import { requireAdmin } from '@/server/auth/guards';
import { writeAudit } from '@/server/admin/audit';
import { notifyWorker } from '@/server/worker';
import { ok, route } from '@/server/http';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 重排一个失败的生成。
 *
 * **不碰积分**：退款已经在失败时结清，重排只把这行退回 PENDING 让 worker 再领一次。
 * 重排成功会走 settleGeneration，但那是幂等的（settle:${id} 唯一约束），
 * 所以「重排后成功了又扣一次钱」这件事不会发生。
 */
export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const gen = await prisma.generation.findUnique({
      where: { id },
      select: { status: true, attempts: true },
    });
    if (!gen) throw errors.notFound('生成记录不存在');
    if (gen.status === 'RUNNING' || gen.status === 'PENDING' || gen.status === 'QUEUED') {
      throw errors.conflict('任务还在队列里或正在执行，不必重排');
    }

    await prisma.$transaction(async (tx) => {
      await tx.generation.update({
        where: { id },
        data: {
          status: 'PENDING',
          // 租约、轮询时间和重试计数一起清掉，否则 worker 会立刻判它「已被别人领走」而跳过
          lockedAt: null,
          lockedBy: null,
          nextPollAt: null,
          attempts: 0,
          // 上一轮的失败原因留着没意义了，清掉免得和这次的结果混淆
          errorCode: null,
          errorMessage: null,
        },
      });
      await writeAudit(tx, {
        adminId: admin.id,
        action: 'generation.retry',
        targetType: 'Generation',
        targetId: id,
        diff: { from: gen.status, attempts: gen.attempts },
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      });
    });

    notifyWorker();
    return ok({ id, status: 'PENDING' });
  },
);
