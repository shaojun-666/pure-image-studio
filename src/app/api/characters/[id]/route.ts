import { z } from 'zod';
import { requireUser } from '@/server/auth/guards';
import { isUniqueViolation } from '@/server/credits/ledger';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(24).optional(),
    description: z.string().trim().max(600).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: '没有要改的字段',
  });

type Ctx = { params: Promise<{ id: string }> };

/**
 * ★ 改名只会影响**之后**写的提示词。
 *   已经写好的提示词里存的是字面量 `@[旧名]`，改名后那些 token 就匹配不上了 ——
 *   不会报错，只是不再注入描述（用户重新 @ 一次即可）。
 *   已提交的生成不受影响：它们在 params.characters 里存的是提交那一刻的快照。
 */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = patchSchema.parse(await req.json());

  const owned = await prisma.character.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!owned) throw errors.notFound('形象不存在');

  try {
    const updated = await prisma.character.update({
      where: { id },
      data: { name: body.name, description: body.description },
      select: { id: true, name: true, description: true },
    });
    return ok(updated);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw errors.conflict(`已经有一个叫「${body.name}」的形象了`);
    }
    throw e;
  }
});

/**
 * 删形象。挂着的 Asset 行**不删** ——
 * 若它来自历史生成，字节属于那张 GenerationImage，删了 Asset 行等于抹掉一条线索；
 * 若是上传来的，留着正好让它按 expiresAt 被将来的 GC 回收。
 */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const { count } = await prisma.character.deleteMany({
    where: { id, userId: user.id },
  });
  if (!count) throw errors.notFound('形象不存在');

  return ok({ id });
});
