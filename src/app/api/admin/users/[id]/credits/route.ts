import { z } from 'zod';
import { requireAdmin } from '@/server/auth/guards';
import { adminGrant } from '@/server/credits/balance';
import { ok, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  /** 正为发放，负为扣减（客服补偿的两种方向都要用） */
  amount: z.number().int().refine((n) => n !== 0, '数量不能为 0'),
  reason: z.string().trim().min(1).max(200),
});

export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const result = await adminGrant({
      userId: id,
      amount: body.amount,
      adminId: admin.id,
      reason: body.reason,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    return ok(result);
  },
);
