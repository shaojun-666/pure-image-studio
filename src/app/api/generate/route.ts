import { headers } from 'next/headers';
import { requireUser } from '@/server/auth/guards';
import { createGeneration } from '@/server/generation/create';
import { generateBodySchema } from '@/server/generation/schema';
import { ok, route } from '@/server/http';

export const runtime = 'nodejs';

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = generateBodySchema.parse(await req.json());

  const h = await headers();
  const result = await createGeneration({
    userId: user.id,
    body,
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  });

  // 命中幂等键返回 200，新任务返回 202
  return ok(result, { status: result.deduped ? 200 : 202 });
});
