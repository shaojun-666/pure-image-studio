import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { requireAdmin } from '@/server/auth/guards';
import { writeAudit } from '@/server/admin/audit';
import { ok, route } from '@/server/http';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  titleI18n: z.object({ zh: z.string().min(1), en: z.string().min(1) }).optional(),
  descriptionI18n: z.object({ zh: z.string(), en: z.string() }).nullish(),
  coverKey: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  negativePrompt: z.string().nullish(),
  modelId: z.string().nullish(),
  stylePresetId: z.string().nullish(),
  params: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().nullish(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export const PATCH = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());

    const before = await prisma.explorePost.findUnique({
      where: { id },
      select: { status: true, publishedAt: true, slug: true, featured: true },
    });
    if (!before) throw errors.notFound('探索内容不存在');

    // 首次发布才盖时间戳；已发布的来回改标题不该把它顶到「最新」第一位
    const publishedAt =
      body.status === 'PUBLISHED' && !before.publishedAt ? new Date() : undefined;

    // 同 create：裸外键标量必须走 unchecked，否则 TS 会挑错联合分支。
    // 两个 JSON 列先从 body 里摘出来单独处理，不能跟着 ...rest 一起摊进来 ——
    // 摊进来的 null 会和下面 DbNull 的分支合成 `null | DbNull`，那是非法类型。
    const { descriptionI18n, params, ...rest } = body;
    const data: Prisma.ExplorePostUncheckedUpdateInput = {
      ...rest,
      ...(params ? { params: params as Prisma.InputJsonValue } : {}),
      // 显式传 null 的语义是「清空这个 JSON 列」，Prisma 要求用 DbNull 表达
      ...(descriptionI18n !== undefined
        ? { descriptionI18n: descriptionI18n ?? Prisma.DbNull }
        : {}),
      ...(publishedAt ? { publishedAt } : {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const post = await tx.explorePost.update({ where: { id }, data });
      await writeAudit(tx, {
        adminId: admin.id,
        action: 'explore.update',
        targetType: 'ExplorePost',
        targetId: id,
        // 记下改动前后的关键位，排查「谁把它下架了」时不用猜
        diff: {
          slug: post.slug,
          from: { status: before.status, featured: before.featured },
          to: { status: post.status, featured: post.featured },
          changed: Object.keys(body),
        },
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      });
      return post;
    });

    return ok({ id: updated.id, slug: updated.slug, status: updated.status });
  },
);

export const DELETE = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const post = await prisma.explorePost.findUnique({ where: { id }, select: { slug: true } });
    if (!post) throw errors.notFound('探索内容不存在');

    await prisma.$transaction(async (tx) => {
      await tx.explorePost.delete({ where: { id } });
      await writeAudit(tx, {
        adminId: admin.id,
        action: 'explore.delete',
        targetType: 'ExplorePost',
        targetId: id,
        diff: { slug: post.slug },
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      });
    });

    return ok({ id });
  },
);
