import type { PrismaClient } from '@prisma/client';
import { flatCatalog } from '../../src/server/providers';

/** 把代码目录投影进 ModelRegistry。已存在的行只更新代码权威字段。 */
export async function seedModels(prisma: PrismaClient) {
  const catalog = flatCatalog();

  for (const m of catalog) {
    const data = {
      providerKey: m.providerKey,
      providerModelId: m.id,
      displayNameI18n: m.displayName,
      descriptionI18n: m.description ?? undefined,
      badgeI18n: m.badge ?? undefined,
      tier: m.tier,
      creditCost: m.creditCost,
      capabilities: m.capabilities as unknown as object,
      maxBatch: m.capabilities.maxBatch,
      sortOrder: m.sortOrder,
      enabled: m.enabled,
      isVisible: m.isVisible,
      isDefault: m.isDefault,
    };

    await prisma.modelRegistry.upsert({
      where: { id: m.id },
      // 后台可改的字段（enabled / sortOrder / 价格覆盖）不在这里覆盖
      update: {
        providerKey: data.providerKey,
        providerModelId: data.providerModelId,
        displayNameI18n: data.displayNameI18n,
        descriptionI18n: data.descriptionI18n,
        badgeI18n: data.badgeI18n,
        tier: data.tier,
        creditCost: data.creditCost,
        capabilities: data.capabilities,
        maxBatch: data.maxBatch,
        /**
         * isVisible 是运营字段（后台能改），默认不覆盖。
         * 但必须支持**单向关闭** —— 代码里写 isVisible: false 表达的是产品决策
         * 「这个模型不该出现在用户的下拉框」，比如 mock。若完全不动它，
         * 老库里的 mock 行会永远停在 true，代码怎么改都关不掉。
         * 反过来代码说 true 时不覆盖，后台主动下架的决定仍然算数。
         */
        ...(data.isVisible ? {} : { isVisible: false }),
      },
      create: { id: m.id, ...data },
    });
  }

  // 目录里已删除的模型：下架而非删行，避免打断历史记录的外键
  const ids = catalog.map((m) => m.id);
  await prisma.modelRegistry.updateMany({
    where: { id: { notIn: ids }, enabled: true },
    data: { enabled: false, isVisible: false },
  });

  console.log(`  ✓ 模型 ${catalog.length} 个`);
}
