import { z } from 'zod';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { translatePrompt } from '@/server/providers/text';
import { assertBurst, PROMPT_CALLS_PER_5MIN } from '@/server/ratelimit';

export const runtime = 'nodejs';

const bodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
  to: z.string().max(10).default('en'),
  modelId: z.string().optional(),
});

/** 同样要限流，理由见 enhance 路由 —— 每次调用都消耗一次百炼文本额度 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  assertBurst(`prompt:${user.id}`, PROMPT_CALLS_PER_5MIN, 5 * 60_000);
  const body = bodySchema.parse(await req.json());
  return ok(await translatePrompt({ ...body, req, userId: user.id }));
});
