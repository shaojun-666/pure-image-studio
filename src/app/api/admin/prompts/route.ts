import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { requireAdmin } from '@/server/auth/guards';
import { writeAudit } from '@/server/admin/audit';
import { ok, route } from '@/server/http';
import { cursorArgs, slicePage, PAGE_SIZE } from '@/server/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
});

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const q = listQuery.parse(Object.fromEntries(url.searchParams));

  const rows = await prisma.promptPreset.findMany({
    where: {
      ...(q.category ? { category: q.category } : {}),
      ...(q.q
        ? {
            OR: [
              { slug: { contains: q.q, mode: 'insensitive' as const } },
              { prompt: { contains: q.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    ...cursorArgs(q.cursor, q.limit),
    select: {
      id: true,
      slug: true,
      titleI18n: true,
      // 提示词正文永不翻译，后台也照原样展示
      prompt: true,
      negativePrompt: true,
      category: true,
      tags: true,
      enabled: true,
      isCurated: true,
      ownerUserId: true,
      sortOrder: true,
      usageCount: true,
    },
  });

  return ok(slicePage(rows, q.limit));
});

const createSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'slug 只能是小写字母、数字和连字符'),
  titleI18n: z.object({ zh: z.string().min(1), en: z.string().min(1) }),
  prompt: z.string().min(1),
  negativePrompt: z.string().nullish(),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  recommendedModelId: z.string().nullish(),
  sortOrder: z.number().int().default(100),
  enabled: z.boolean().default(true),
});

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const body = createSchema.parse(await req.json());

  const data: Prisma.PromptPresetUncheckedCreateInput = {
    ...body,
    negativePrompt: body.negativePrompt ?? null,
    recommendedModelId: body.recommendedModelId ?? null,
  };

  const preset = await prisma.$transaction(async (tx) => {
    const created = await tx.promptPreset.create({ data });
    await writeAudit(tx, {
      adminId: admin.id,
      action: 'prompt.create',
      targetType: 'PromptPreset',
      targetId: created.id,
      diff: { slug: created.slug, category: created.category },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });
    return created;
  });

  return ok({ id: preset.id, slug: preset.slug });
});
