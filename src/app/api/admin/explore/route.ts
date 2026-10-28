import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { requireAdmin } from '@/server/auth/guards';
import { storage } from '@/server/storage';
import { writeAudit } from '@/server/admin/audit';
import { ok, route } from '@/server/http';
import { cursorArgs, slicePage, PAGE_SIZE } from '@/server/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  q: z.string().trim().optional(),
});

/** 后台列表不筛 status：草稿必须看得见，否则「发布草稿」无从谈起 */
export const GET = route(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const q = listQuery.parse(Object.fromEntries(url.searchParams));

  const rows = await prisma.explorePost.findMany({
    where: {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { slug: { contains: q.q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    ...cursorArgs(q.cursor, q.limit),
    select: {
      id: true,
      slug: true,
      titleI18n: true,
      coverKey: true,
      category: true,
      tags: true,
      featured: true,
      status: true,
      sortOrder: true,
      modelId: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  // 与公开接口同规则：public/* 的 key 由 storage 解析，前端不自己拼路径
  return ok(
    slicePage(
      rows.map(({ coverKey, ...p }) => ({ ...p, coverUrl: storage.publicUrl(coverKey) })),
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
  titleI18n: z.object({ zh: z.string().min(1), en: z.string().min(1) }),
  descriptionI18n: z.object({ zh: z.string(), en: z.string() }).nullish(),
  coverKey: z.string().min(1),
  prompt: z.string().min(1),
  negativePrompt: z.string().nullish(),
  modelId: z.string().nullish(),
  stylePresetId: z.string().nullish(),
  params: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  category: z.string().nullish(),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
});

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const body = createSchema.parse(await req.json());
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  // 显式声明成 unchecked：这里走的是裸外键标量（modelId/stylePresetId），
  // 不写类型的话 TS 会在 checked / unchecked 两个联合分支之间摇摆
  const data: Prisma.ExplorePostUncheckedCreateInput = {
    slug: body.slug,
    titleI18n: body.titleI18n,
    descriptionI18n: body.descriptionI18n ?? Prisma.DbNull,
    coverKey: body.coverKey,
    prompt: body.prompt,
    negativePrompt: body.negativePrompt ?? null,
    modelId: body.modelId ?? null,
    stylePresetId: body.stylePresetId ?? null,
    params: body.params as Prisma.InputJsonValue,
    tags: body.tags,
    category: body.category ?? null,
    featured: body.featured,
    sortOrder: body.sortOrder,
    status: body.status,
    // 发布时必须落时间戳：sitemap 和「最新」排序都读它
    publishedAt: body.status === 'PUBLISHED' ? new Date() : null,
  };

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.explorePost.create({ data });
    await writeAudit(tx, {
      adminId: admin.id,
      action: 'explore.create',
      targetType: 'ExplorePost',
      targetId: created.id,
      diff: { slug: created.slug, status: created.status },
      ip,
    });
    return created;
  });

  return ok({ id: post.id, slug: post.slug, status: post.status });
});
