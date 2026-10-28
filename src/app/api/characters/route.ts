import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '@/server/auth/guards';
import { isUniqueViolation } from '@/server/credits/ledger';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { storage } from '@/server/storage';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 每个用户最多建多少个形象。不是产品限制，是防呆 —— 列表要一次性全拉回来 */
const MAX_CHARACTERS = 50;

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(24),
    description: z.string().trim().max(600).default(''),
    /**
     * 图源，**都可以不传** —— 不传就是「文字形象」，只靠 description 注入。
     * 两个都传是错的（双真源）；两个都不传则要求 description 非空，见下面的 refine。
     */
    assetId: z.string().min(1).optional(),
    imageId: z.string().min(1).optional(),
  })
  .refine((v) => !(v.assetId && v.imageId), {
    message: 'assetId 与 imageId 只能给一个',
  })
  .refine((v) => Boolean(v.assetId || v.imageId) || v.description.length > 0, {
    // 没有参考图、又没有描述 = 这个形象什么都不会注入，建出来只会占着名字骗人
    message: '文字形象必须写外形描述',
  });

/**
 * 把「历史生成里的一张图」变成一行可复用的 Asset。
 *
 * ★ 复用同一个 storageKey，**不复制字节** —— 这正是 Asset.sourceImageId 存在的理由。
 *   顺手不写 expiresAt：那一列的语义是「未被引用的上传素材 7 天后可清理」，
 *   而形象是长期资产，挂上一张会过期的图等于埋雷（GC 一跑形象就瞎了）。
 */
async function assetFromImage(userId: string, imageId: string): Promise<string> {
  const img = await prisma.generationImage.findFirst({
    where: { id: imageId, userId },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      bytes: true,
      width: true,
      height: true,
    },
  });
  if (!img) throw errors.notFound('图片不存在');

  const asset = await prisma.asset.create({
    data: {
      id: randomUUID(),
      userId,
      kind: 'SUBJECT_REF',
      storageKey: img.storageKey,
      mimeType: img.mimeType,
      bytes: img.bytes,
      width: img.width,
      height: img.height,
      sourceImageId: img.id,
    },
  });
  return asset.id;
}

/** 我的形象列表。只返回自己的 —— 没有公开形象这回事 */
export const GET = route(async () => {
  const user = await requireUser();

  const rows = await prisma.character.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      asset: {
        select: { id: true, storageKey: true, width: true, height: true },
      },
    },
  });

  return ok({
    items: await Promise.all(
      rows.map(async ({ asset, createdAt, ...c }) => ({
        ...c,
        createdAt: createdAt.toISOString(),
        // asset 可空 = 文字形象：assetId/url/width/height 一并为 null，前端据此判类型
        assetId: asset?.id ?? null,
        url: asset ? await storage.signedUrl(asset.storageKey) : null,
        width: asset?.width ?? null,
        height: asset?.height ?? null,
      })),
    ),
  });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = createSchema.parse(await req.json());

  const count = await prisma.character.count({ where: { userId: user.id } });
  if (count >= MAX_CHARACTERS) {
    throw errors.validation(`最多创建 ${MAX_CHARACTERS} 个形象`);
  }

  // 图源可缺省：给了历史图就先落一行 Asset，两个都没给就是文字形象
  const assetId =
    body.assetId ??
    (body.imageId ? await assetFromImage(user.id, body.imageId) : null);

  // 归属校验：不能拿别人的 assetId 建形象（imageId 那条路已在上面的查询里限定 userId）
  if (assetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, userId: user.id },
      select: { id: true },
    });
    if (!asset) throw errors.notFound('参考图不存在');
  }

  try {
    const created = await prisma.character.create({
      data: {
        userId: user.id,
        name: body.name,
        description: body.description,
        assetId,
      },
      select: { id: true, name: true, description: true, createdAt: true },
    });
    return ok({ ...created, createdAt: created.createdAt.toISOString() }, { status: 201 });
  } catch (e) {
    // userId+name 唯一：@[名字] 靠名字反查 id，重名会让解析有歧义，所以这里必须报错而不是静默改个名
    if (isUniqueViolation(e)) {
      throw errors.conflict(`已经有一个叫「${body.name}」的形象了`);
    }
    throw e;
  }
});
