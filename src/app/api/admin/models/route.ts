import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { requireAdmin } from '@/server/auth/guards';
import { writeAudit } from '@/server/admin/audit';
import { listAdminModels } from '@/server/providers/registry';
import { findInCatalog } from '@/server/providers';
import { ok, route } from '@/server/http';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireAdmin();
  return ok(await listAdminModels());
});

/**
 * 只能改 enabled / isVisible / sortOrder / creditCostOverride / badgeI18n。
 * capabilities 不在 schema 里 —— 它来自代码目录（见 providers/index.ts），
 * 后台改它等于绕过部署，会让「前端按 capabilities 门控」这条链断掉。
 */
const patchSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  creditCostOverride: z.number().int().min(0).nullish(),
  badgeI18n: z.object({ zh: z.string(), en: z.string() }).nullish(),
});

export const PATCH = route(async (req: Request) => {
  const admin = await requireAdmin();
  const body = patchSchema.parse(await req.json());

  const base = findInCatalog(body.id);
  if (!base) throw errors.notFound(`代码目录里没有模型 ${body.id}`);

  const { id, ...rest } = body;
  const data = {
    enabled: rest.enabled,
    isVisible: rest.isVisible,
    sortOrder: rest.sortOrder,
    creditCostOverride: rest.creditCostOverride,
    badgeI18n: rest.badgeI18n ?? undefined,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.modelRegistry.upsert({
      where: { id },
      // 库里还没这行时（全新环境没 seed）用代码目录补上必填字段
      create: {
        id,
        providerKey: base.providerKey,
        providerModelId: base.providerKey,
        displayNameI18n: base.displayName,
        tier: base.tier,
        creditCost: base.creditCost,
        capabilities: {},
        maxBatch: base.capabilities.maxBatch,
        ...data,
      },
      update: data,
    });
    await writeAudit(tx, {
      adminId: admin.id,
      action: 'model.update',
      targetType: 'ModelRegistry',
      targetId: id,
      // 只记真正提交了的字段；undefined 不是合法 JSON，先剔掉
      diff: Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined),
      ) as Prisma.InputJsonValue,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });
    return row;
  });

  return ok({ id: updated.id, enabled: updated.enabled, sortOrder: updated.sortOrder });
});
