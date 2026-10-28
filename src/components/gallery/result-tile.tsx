'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Download, Heart, Maximize2, Wand2, AlertTriangle } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { SaveAsCharacter } from '@/components/gallery/save-as-character';
import { cn } from '@/lib/utils';
import type { GenerationImageDTO } from '@/types/generator';

/**
 * blur-up：先用 24px 的 dataURI 占位图打底，真图 onLoad 后交叉淡入。
 * 占位图随接口一起返回，因此不会多一次网络往返。
 */
function BlurUp({
  src,
  placeholder,
  alt,
  className,
}: {
  src: string;
  placeholder: string | null;
  alt: string;
  className?: string;
}) {
  const t = useTranslations('generator.results');
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return (
      <div className={cn('grid place-items-center bg-secondary/50', className)}>
        <span className="text-xs text-muted-foreground">{t('expired')}</span>
      </div>
    );
  }

  return (
    <>
      {placeholder && !loaded && (
        <img
          src={placeholder}
          alt=""
          aria-hidden
          className={cn('absolute inset-0 scale-110 blur-xl', className)}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          'transition-opacity duration-500',
          loaded ? 'opacity-100' : 'opacity-0',
          className,
        )}
      />
    </>
  );
}

export function ResultTile({
  image,
  ratio,
  onOpen,
  onFavorite,
  onRemix,
}: {
  image: GenerationImageDTO;
  ratio: number;
  onOpen: () => void;
  onFavorite: () => void;
  onRemix: () => void;
}) {
  const t = useTranslations('generator.results');
  const done = image.status === 'SUCCEEDED' && image.url;

  if (image.status === 'FAILED') {
    return (
      <div
        style={{ aspectRatio: ratio }}
        className="grid place-items-center rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-center"
      >
        <div className="space-y-1.5">
          <AlertTriangle className="mx-auto size-5 text-destructive" />
          <p className="text-xs text-destructive">{image.errorMessage ?? t('failed')}</p>
        </div>
      </div>
    );
  }

  if (!done) {
    return (
      <div
        style={{ aspectRatio: ratio }}
        className="shimmer relative overflow-hidden rounded-xl bg-secondary/40"
      />
    );
  }

  return (
    <div
      style={{ aspectRatio: ratio }}
      className="group relative overflow-hidden rounded-xl border border-border/60 bg-secondary/40"
    >
      {/* 整块可点开大图，操作条浮在它上面 */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('open')}
        className="absolute inset-0 cursor-zoom-in"
      />

      <BlurUp
        src={image.url!}
        placeholder={image.placeholder}
        alt={t('alt', { index: image.index + 1 })}
        className="pointer-events-none h-full w-full object-cover"
      />

      {image.nsfw && (
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px]">
          {t('nsfw')}
        </span>
      )}

      {/* 悬浮操作条：底部渐变遮罩，不遮挡主体 */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <a
          href={`/api/images/${image.id}/download`}
          className="rounded-lg p-1.5 text-white/90 transition-colors hover:bg-white/15"
          title={t('download')}
        >
          <Download className="size-4" />
        </a>
        <button
          type="button"
          onClick={onFavorite}
          title={image.favorited ? t('unfavorite') : t('favorite')}
          className="rounded-lg p-1.5 transition-colors hover:bg-white/15"
        >
          <Heart
            className={cn('size-4', image.favorited ? 'fill-rose-400 text-rose-400' : 'text-white/90')}
          />
        </button>
        <button
          type="button"
          onClick={onRemix}
          title={t('remix')}
          className="rounded-lg p-1.5 text-white/90 transition-colors hover:bg-white/15"
        >
          <Wand2 className="size-4" />
        </button>

        <SaveAsCharacter
          imageId={image.id}
          iconOnly
          className="rounded-lg p-1.5 text-white/90 transition-colors hover:bg-white/15"
        />

        <Tooltip content={`${image.width} × ${image.height}`} side="top" className="ml-auto">
          <span className="rounded-lg p-1.5 text-white/90">
            <Maximize2 className="size-4" />
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
