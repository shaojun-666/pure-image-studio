import { z } from 'zod';
import { Prisma, StyleCategory } from '@prisma/client';
import { prisma } from '@/server/db';
import { requireAdmin } from '@/server/auth/guards';
import { writeAudit } from '@/server/admin/audit';
import { storage } from '@/server/storage';
import { ok, route } from '@/server/http';
import { cursorArgs, slicePage, PAGE_SIZE } from '@/server/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  q: z.string().trim().optional(),
  category: z.nativeEnum(StyleCategory).optional(),
  /** 只看用户自定义的（ownerUserId 非空），运营平时不看这些 */
  /**
   * ★ 不能用 z.coerce.boolean() —— Boolean('false') 是 true，
   *   于是 `?mine=false` 反而变成「只看自定义」，做的事和字面意思相反。
   *   写法与 env.ts 里那个 bool() 一致。
   */
  mine: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const q = listQuery.parse(Object.fromEntries(url.searchParams));

  const rows = await prisma.stylePreset.findMany({
    where: {
      ...(q.category ? { category: q.category } : {}),
      ...(q.mine ? { ownerUserId: { not: null } } : {}),
      ...(q.q
        ? {
            OR: [
              { slug: { contains: q.q, mode: 'insensitive' as const } },
              { tags: { has: q.q } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    ...cursorArgs(q.cursor, q.limit),
    select: {
      id: true,
      slug: true,
      nameI18n: true,
      category: true,
      tags: true,
      thumbnailKey: true,
      promptSuffix: true,
      enabled: true,
      isCurated: true,
      ownerUserId: true,
      sortOrder: true,
      usageCount: true,
    },
  });

  // 后台要看得见缩略图，同样由 storage 解析 URL，不能让前端自己拼
  return ok(
    slicePage(
      rows.map(({ thumbnailKey, ...s }) => ({
        ...s,
        thumbnailUrl: storage.publicUrl(thumbnailKey),
      })),
      q.limit,
    ),
  );
});

const createSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'slug 只能是小写字母、数字和连字符'),
  nameI18n: z.object({ zh: z.string().min(1), en: z.string().min(1) }),
  category: z.nativeEnum(StyleCategory),
  tags: z.array(z.string()).default([]),
  thumbnailKey: z.string().min(1),
  promptSuffix: z.string().min(1),
  negativeSuffix: z.string().nullish(),
  sortOrder: z.number().int().default(100),
  enabled: z.boolean().default(true),
});

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const body = createSchema.parse(await req.json());

  const data: Prisma.StylePresetUncheckedCreateInput = {
    ...body,
    negativeSuffix: body.negativeSuffix ?? null,
  };

  const style = await prisma.$transaction(async (tx) => {
    const created = await tx.stylePreset.create({ data });
    await writeAudit(tx, {
      adminId: admin.id,
      action: 'style.create',
      targetType: 'StylePreset',
      targetId: created.id,
      diff: { slug: created.slug, category: created.category },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });
    return created;
  });

  return ok({ id: style.id, slug: style.slug });
});
