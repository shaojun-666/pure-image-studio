'use client';

import { apiFetch } from '@/lib/api-client';

export type AssetKind =
  | 'REFERENCE'
  | 'STYLE_REF'
  | 'SUBJECT_REF'
  | 'CONTROL'
  | 'MASK'
  | 'UPLOAD';

export interface UploadedAsset {
  assetId: string;
  kind: AssetKind;
  url: string;
  width: number;
  height: number;
  bytes: number;
  hasAlpha: boolean;
}

/** 服务端上限是 10MB / 4096px，这里先挡一道，省一次白跑的往返 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function uploadAsset(
  file: File | Blob,
  kind: AssetKind = 'REFERENCE',
): Promise<UploadedAsset> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('文件超过 10MB');
  }

  const form = new FormData();
  form.append('file', file, file instanceof File ? file.name : 'upload.png');
  form.append('kind', kind);

  return apiFetch<UploadedAsset>('/api/uploads', { method: 'POST', body: form });
}
