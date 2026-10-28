'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MetadataPanel } from '@/components/gallery/metadata-panel';
import { SaveAsCharacter } from '@/components/gallery/save-as-character';
import type { CatalogModel, GenerationDTO, GenerationImageDTO } from '@/types/generator';

export function ImageLightbox({
  generation,
  images,
  index,
  models,
  styleName,
  onIndexChange,
  onClose,
  onRemix,
}: {
  generation: GenerationDTO;
  images: GenerationImageDTO[];
  index: number;
  models: CatalogModel[];
  styleName?: string | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onRemix: () => void;
}) {
  const t = useTranslations('generator.results');
  const open = index >= 0 && index < images.length;
  const image = open ? images[index] : null;

  // ← → 切换：大图浏览里这是刚需，鼠标点箭头太慢
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, images.length, onIndexChange]);

  if (!image?.url) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="w-[min(96vw,72rem)]"
      title={t('detailTitle')}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="relative flex items-center justify-center rounded-xl bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt=""
            className="max-h-[62vh] w-auto rounded-lg object-contain"
          />

          {index > 0 && (
            <button
              type="button"
              onClick={() => onIndexChange(index - 1)}
              className="absolute left-2 rounded-full bg-black/60 p-2 transition-colors hover:bg-black/80"
              aria-label={t('prev')}
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          {index < images.length - 1 && (
            <button
              type="button"
              onClick={() => onIndexChange(index + 1)}
              className="absolute right-2 rounded-full bg-black/60 p-2 transition-colors hover:bg-black/80"
              aria-label={t('next')}
            >
              <ChevronRight className="size-5" />
            </button>
          )}
        </div>

        <div className="space-y-3">
          <MetadataPanel generation={generation} models={models} styleName={styleName} />

          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={onRemix}>
              {t('remix')}
            </Button>
            <a
              href={`/api/images/${image.id}/download`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm transition-colors hover:border-primary/40"
            >
              <Download className="size-4" />
              {t('download')}
            </a>
          </div>

          <SaveAsCharacter
            imageId={image.id}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-border px-4 text-sm transition-colors hover:border-primary/40"
          />
        </div>
      </div>
    </Dialog>
  );
}
