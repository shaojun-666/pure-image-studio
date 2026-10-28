import { z } from 'zod';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { enhancePrompt } from '@/server/providers/text';
import { assertBurst, PROMPT_CALLS_PER_5MIN } from '@/server/ratelimit';
import { GENERATION_MODES } from '@/lib/ai/contracts';

export const runtime = 'nodejs';

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  mode: z.enum(GENERATION_MODES).default('textToImage'),
  locale: z.string().max(10).default('zh'),
  styleHint: z.string().max(120).optional(),
  modelId: z.string().optional(),
});

/**
 * 提示词润色：0 积分，但**不是**零成本 —— 每次调用都要打一次百炼的文本模型。
 * 所以这里必须限流：不限的话登录用户循环调用就能把文本额度烧光，
 * 而额度一光，dashscope 会把所有人生成失败都映射成「免费额度已用尽」。
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  assertBurst(`prompt:${user.id}`, PROMPT_CALLS_PER_5MIN, 5 * 60_000);
  const body = bodySchema.parse(await req.json());
  const result = await enhancePrompt({ ...body, req, userId: user.id });

  return ok(result);
});
