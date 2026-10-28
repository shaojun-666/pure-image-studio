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
  prompt: z.string().min(1).optional(),
  negativePrompt: z.string().nullish(),
  category: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  recommendedModelId: z.string().nullish(),
  sortOrder: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());

    const before = await prisma.promptPreset.findUnique({
      where: { id },
      select: { slug: true, enabled: true },
    });
    if (!before) throw errors.notFound('提示词不存在');

    const data: Prisma.PromptPresetUncheckedUpdateInput = {
      ...body,
      ...(body.negativePrompt !== undefined
        ? { negativePrompt: body.negativePrompt ?? null }
        : {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const preset = await tx.promptPreset.update({ where: { id }, data });
      await writeAudit(tx, {
        adminId: admin.id,
        action: 'prompt.update',
        targetType: 'PromptPreset',
        targetId: id,
        diff: {
          slug: preset.slug,
          from: { enabled: before.enabled },
          to: { enabled: preset.enabled },
          changed: Object.keys(body),
        },
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      });
      return preset;
    });

    return ok({ id: updated.id, enabled: updated.enabled });
  },
);

export const DELETE = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const preset = await prisma.promptPreset.findUnique({
      where: { id },
      select: { slug: true, ownerUserId: true },
    });
    if (!preset) throw errors.notFound('提示词不存在');

    await prisma.$transaction(async (tx) => {
      await tx.promptPreset.delete({ where: { id } });
      await writeAudit(tx, {
        adminId: admin.id,
        action: 'prompt.delete',
        targetType: 'PromptPreset',
        targetId: id,
        diff: { slug: preset.slug, wasUserOwned: Boolean(preset.ownerUserId) },
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      });
    });

    return ok({ id });
  },
);
