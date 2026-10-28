import { randomUUID } from 'node:crypto';
import { requireUser } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { normalizeUpload } from '@/server/images/probe';
import { ok, route } from '@/server/http';
import { keys, storage } from '@/server/storage';
import { errors } from '@/types/api';

export const runtime = 'nodejs';

const KINDS = [
  'REFERENCE',
  'STYLE_REF',
  'SUBJECT_REF',
  'CONTROL',
  'MASK',
  'UPLOAD',
] as const;

/** 未被引用的上传素材 7 天后可被 GC */
const ASSET_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const POST = route(async (req: Request) => {
  const user = await requireUser();

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw errors.validation('缺少 file 字段');

  const rawKind = String(form.get('kind') ?? 'REFERENCE');
  const kind = (KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as (typeof KINDS)[number])
    : 'REFERENCE';

  const probed = await normalizeUpload(Buffer.from(await file.arrayBuffer()));

  const assetId = randomUUID();
  const storageKey = keys.asset(user.id, assetId, probed.mimeType);
  await storage.put(storageKey, probed.data, { contentType: probed.mimeType });

  const asset = await prisma.asset.create({
    data: {
      id: assetId,
      userId: user.id,
      kind,
      storageKey,
      mimeType: probed.mimeType,
      bytes: probed.data.byteLength,
      width: probed.width,
      height: probed.height,
      expiresAt: new Date(Date.now() + ASSET_TTL_MS),
    },
  });

  return ok(
    {
      assetId: asset.id,
      kind: asset.kind,
      url: await storage.signedUrl(storageKey),
      width: probed.width,
      height: probed.height,
      bytes: probed.data.byteLength,
      hasAlpha: probed.hasAlpha,
    },
    { status: 201 },
  );
});
