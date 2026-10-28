import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { storage } from '@/server/storage';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 一个人能建多少集合。挡的是脚本化灌库，不是正常使用。 */
const MAX_COLLECTIONS = 100;

/**
 * `coverImageId` 在 schema 里是裸字段（没建 relation），include 不出来，
 * 所以封面单独查一次。图被删掉时封面查不到——容忍 null，不在读路径上做修复，
 * 封面重建交给 items 路由增删后的重算。
 */
export const GET = route(async () => {
  const user = await requireUser();

  const rows = await prisma.collection.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });

  const coverIds = rows
    .map((c) => c.coverImageId)
    .filter((v): v is string => Boolean(v));

  const covers = coverIds.length
    ? await prisma.generationImage.findMany({
        where: { id: { in: coverIds }, deletedAt: null },
        select: { id: true, thumbKey: true, placeholder: true },
      })
    : [];
  const coverMap = new Map(covers.map((c) => [c.id, c]));

  const items = await Promise.all(
    rows.map(async (c) => {
      const cover = c.coverImageId ? coverMap.get(c.coverImageId) : undefined;
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        itemCount: c.itemCount,
        coverUrl: cover?.thumbKey ? await storage.signedUrl(cover.thumbKey) : null,
        coverPlaceholder: cover?.placeholder ?? null,
        updatedAt: c.updatedAt.toISOString(),
      };
    }),
  );

  return ok({ items });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).optional(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = createSchema.parse(await req.json());

  const count = await prisma.collection.count({ where: { userId: user.id } });
  if (count >= MAX_COLLECTIONS) {
    throw errors.validation(`集合数量已达上限（${MAX_COLLECTIONS} 个）`);
  }

  const created = await prisma.collection.create({
    data: {
      userId: user.id,
      name: body.name,
      description: body.description || null,
    },
  });

  return ok(
    {
      id: created.id,
      name: created.name,
      description: created.description,
      itemCount: 0,
      coverUrl: null,
      coverPlaceholder: null,
      updatedAt: created.updatedAt.toISOString(),
    },
    { status: 201 },
  );
});
