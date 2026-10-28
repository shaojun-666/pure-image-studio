'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { uploadAsset, type AssetKind, type UploadedAsset } from '@/lib/upload';
import { cn } from '@/lib/utils';
import type { ModelCapabilities } from '@/lib/ai/contracts';

export interface SlotAsset {
  id: string;
  url: string;
  /** 源图像素。蒙版画笔 / 扩图手柄按这个尺寸建 canvas，缺了就只能靠 CSS 猜 */
  width: number;
  height: number;
}

export function Slot({
  asset,
  label,
  hint,
  kind = 'REFERENCE',
  onPick,
  onClear,
}: {
  asset: SlotAsset | null;
  label: string;
  hint?: string;
  /** 素材用途，仅作为 Asset.kind 记录，供后台排查 */
  kind?: AssetKind;
  onPick: (a: UploadedAsset) => void;
  onClear: () => void;
}) {
  const t = useTranslations('generator.reference');
  const [busy, setBusy] = React.useState(false);
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onPick(await uploadAsset(file, kind));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle(e.dataTransfer.files[0]);
      }}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-xl border border-dashed transition-colors',
        over ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
        asset && 'border-solid',
      )}
    >
      {busy ? (
        <Skeleton className="absolute inset-0 rounded-xl" />
      ) : asset ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.url} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            aria-label={t('remove')}
            onClick={onClear}
            className="absolute right-1.5 top-1.5 rounded-md bg-black/70 p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          <span className="text-xs">{label}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );

  return hint ? <Tooltip content={hint} className="w-full">{body}</Tooltip> : body;
}

type SlotsProps = { cap: ModelCapabilities; mode: string } & (
  | {
      variant: 'init';
      initAsset: SlotAsset | null;
      onInitChange: (a: SlotAsset | null) => void;
    }
  | {
      variant: 'refs';
      refs: SlotAsset[];
      onRefsChange: (a: SlotAsset[]) => void;
    }
);

/**
 * 底图槽 / 参考图槽。蒙版画笔与扩图手柄属于编辑器（Phase 4），
 * 这里只负责把图传上去。
 */
export function ReferenceSlots(props: SlotsProps) {
  const t = useTranslations('generator.reference');

  if (props.variant === 'refs') {
    const { cap, refs, onRefsChange } = props;
    const maxRefs = cap.maxReferenceImages;
    if (maxRefs === 0) return null;

    return (
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">{t('references')}</span>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: maxRefs }, (_, i) => (
            <Slot
              key={i}
              asset={refs[i] ?? null}
              label={t('upload')}
              onPick={(a) => {
                // 先按槽位对齐再赋值：refs 比 i 短时，直接赋值会被随后的 compact 吃掉
                const next = Array.from({ length: maxRefs }, (_, j) => refs[j] ?? null);
                next[i] = { id: a.assetId, url: a.url, width: a.width, height: a.height };
                onRefsChange(next.filter((x): x is SlotAsset => x !== null));
              }}
              onClear={() => onRefsChange(refs.filter((_, j) => j !== i))}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('maxFoot', { n: maxRefs })}</p>
      </div>
    );
  }

  const { mode, initAsset, onInitChange } = props;
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{t('initImage')}</span>
      <div className="grid grid-cols-3 gap-2">
        <Slot
          asset={initAsset}
          label={t('upload')}
          hint={t(`initHint.${mode}` as never)}
          onPick={(a) => onInitChange({ id: a.assetId, url: a.url, width: a.width, height: a.height })}
          onClear={() => onInitChange(null)}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('initFoot')}</p>
    </div>
  );
}
