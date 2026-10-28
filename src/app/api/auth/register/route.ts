import { z } from 'zod';
import { prisma } from '@/server/db';
import { env } from '@/server/env';
import { ok, route, toErrorResponse } from '@/server/http';
import { hashPassword } from '@/server/auth/password';
import { appendLedger, isUniqueViolation } from '@/server/credits/ledger';
import { errors } from '@/types/api';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少 8 位').max(72),
  name: z.string().trim().min(1).max(40).optional(),
  locale: z.enum(['zh', 'en']).default('zh'),
});

export const POST = route(async (req: Request) => {
  const body = schema.parse(await req.json());
  const email = body.email.toLowerCase();
  const bonus = env.SIGNUP_BONUS_CREDITS;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw errors.conflict('该邮箱已注册');

  const passwordHash = await hashPassword(body.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name: body.name ?? email.split('@')[0],
          passwordHash,
          locale: body.locale,
          creditBalance: bonus,
        },
        select: { id: true, email: true, name: true, creditBalance: true },
      });

      await appendLedger(tx, {
        userId: created.id,
        kind: 'SIGNUP_BONUS',
        delta: bonus,
        balanceAfter: bonus,
        reason: '注册赠送',
        idempotencyKey: `signup:${created.id}`,
      });

      return created;
    });

    return ok(user, { status: 201 });
  } catch (e) {
    // 并发注册同一邮箱：唯一约束兜底
    if (isUniqueViolation(e)) throw errors.conflict('该邮箱已注册');
    throw e;
  }
});
