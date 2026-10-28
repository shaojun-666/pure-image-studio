import { z } from 'zod';
import { Prisma, StyleCategory } from '@prisma/client';
import { prisma } from '@/server/db';
import { requireAdmin } from '@/server/auth/guards';
import { writeAudit } from '@/server/admin/audit';
import { ok, route } from '@/server/http';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  nameI18n: z.object({ zh: z.string().min(1), en: z.string().min(1) }).optional(),
  category: z.nativeEnum(StyleCategory).optional(),
  tags: z.array(z.string()).optional(),
  thumbnailKey: z.string().min(1).optional(),
  promptSuffix: z.string().min(1).optional(),
  negativeSuffix: z.string().nullish(),
  sortOrder: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());

    const before = await prisma.stylePreset.findUnique({
      where: { id },
      select: { slug: true, enabled: true },
    });
    if (!before) throw errors.notFound('风格不存在');

    const data: Prisma.StylePresetUncheckedUpdateInput = {
      ...body,
      ...(body.negativeSuffix !== undefined
        ? { negativeSuffix: body.negativeSuffix ?? null }
        : {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const style = await tx.stylePreset.update({ where: { id }, data });
      await writeAudit(tx, {
        adminId: admin.id,
        action: 'style.update',
        targetType: 'StylePreset',
        targetId: id,
        diff: {
          slug: style.slug,
          from: { enabled: before.enabled },
          to: { enabled: style.enabled },
          changed: Object.keys(body),
        },
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      });
      return style;
    });

    return ok({ id: updated.id, enabled: updated.enabled });
  },
);

export const DELETE = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const style = await prisma.stylePreset.findUnique({
      where: { id },
      select: { slug: true, ownerUserId: true },
    });
    if (!style) throw errors.notFound('风格不存在');

    await prisma.$transaction(async (tx) => {
      await tx.stylePreset.delete({ where: { id } });
      await writeAudit(tx, {
        adminId: admin.id,
        action: 'style.delete',
        targetType: 'StylePreset',
        targetId: id,
        diff: { slug: style.slug, wasUserOwned: Boolean(style.ownerUserId) },
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      });
    });

    return ok({ id });
  },
);
