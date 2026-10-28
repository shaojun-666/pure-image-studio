'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ResultTile } from '@/components/gallery/result-tile';
import { resolveDimensions } from '@/lib/ai/aspect';
import { cn } from '@/lib/utils';
import type { AspectRatio, Resolution } from '@/lib/ai/contracts';
import type { GenerationImageDTO } from '@/types/generator';

// Tailwind 不支持拼接类名，列数必须查表
const COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 lg:grid-cols-3',
  6: 'grid-cols-2 lg:grid-cols-3',
  7: 'grid-cols-2 lg:grid-cols-4',
  8: 'grid-cols-2 lg:grid-cols-4',
};

/**
 * 结果网格。**槽位数由 batchCount 决定，不由已到达的图片数决定** ——
 * 这样生成中的骨架格从点击那一刻就全部就位，逐张揭晓，
 * 而不是「先 1 格、变 2 格、再变 3 格」的跳动布局。
 */
export function ResultGrid({
  images,
  batchCount,
  aspectRatio,
  resolution,
  onFavorite,
  onRemix,
  onOpen,
  className,
}: {
  images: GenerationImageDTO[];
  batchCount: number;
  aspectRatio: AspectRatio | string;
  resolution: Resolution | string;
  onFavorite: (image: GenerationImageDTO) => void;
  onRemix: (image: GenerationImageDTO) => void;
  onOpen: (index: number) => void;
  className?: string;
}) {
  const t = useTranslations('generator.results');
  const { width, height } = resolveDimensions(
    aspectRatio as AspectRatio,
    resolution as Resolution,
  );
  const ratio = width / height;
  const slots = Math.max(batchCount, images.length);

  if (slots === 0) {
    return (
      <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border/70">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
          <p className="mt-1 text-xs text-muted-foreground/70">{t('emptyHint')}</p>
        </div>
      </div>
    );
  }

  return (
    // data-result-grid：验收脚本要数「本批次出了几张」，页面上还有风格缩略图、
    // 历史缩略图同样是 /api/files/ 的图，没有这个锚点就只能数到一锅乱账
    <div
      data-result-grid
      /**
       * enter-stagger：点击生成时 8 个骨架格错峰浮起，出图后逐张替换也带一次淡入
       * —— 这是「逐张揭晓」观感的关键。纯 CSS（见 globals.css），不需要 JS 参与，
       * 所以不会和 SSE 每次推图的重渲染打架：节点带 key，已存在的格子不会重播动画。
       */
      className={cn(
        'enter-stagger grid gap-3',
        COLS[Math.min(slots, 8)] ?? COLS[4],
        className,
      )}
    >
      {Array.from({ length: slots }, (_, i) => {
        const image = images.find((x) => x.index === i);
        return image ? (
          <ResultTile
            key={image.id}
            image={image}
            ratio={ratio}
            onOpen={() => onOpen(i)}
            onFavorite={() => onFavorite(image)}
            onRemix={() => onRemix(image)}
          />
        ) : (
          <div
            key={`pending-${i}`}
            style={{ aspectRatio: ratio }}
            className="shimmer rounded-xl bg-secondary/40"
          />
        );
      })}
    </div>
  );
}
