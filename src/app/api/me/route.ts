import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import {
  claimDailyGrant,
  nextBeijingMidnight,
} from '@/server/credits/daily-grant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const sessionUser = await requireUser();

  // 每日免费额度在这里惰性补齐：无需 cron，当天首次活动即生效
  const grant = await claimDailyGrant(sessionUser.id);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      locale: true,
      creditBalance: true,
      createdAt: true,
    },
  });

  return ok({
    ...user,
    dailyGrant: {
      granted: grant.granted,
      nextAt: nextBeijingMidnight().toISOString(),
    },
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  image: z.string().url().nullable().optional(),
  locale: z.enum(['zh', 'en']).optional(),
});

export const PATCH = route(async (req: Request) => {
  const sessionUser = await requireUser();
  const body = patchSchema.parse(await req.json());

  const user = await prisma.user.update({
    where: { id: sessionUser.id },
    data: body,
    select: { id: true, email: true, name: true, image: true, locale: true },
  });

  return ok(user);
});
