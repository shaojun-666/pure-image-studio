'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

/**
 * 前后对比。拖动条用一层透明的原生 range 实现 ——
 * 键盘可达、触屏可用、点击轨道即跳转，比自己算 pointer 坐标稳得多。
 * 底衬棋盘格，抠图的透明区因此一眼可见。
 */
export function CompareSlider({
  before,
  after,
  aspect,
  beforeLabel,
  afterLabel,
}: {
  before: string;
  after: string;
  /** 形如 "1024 / 1024"，两张图尺寸一致，共用一个容器比例 */
  aspect: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  const t = useTranslations('tools.compare');
  const [pos, setPos] = React.useState(50);

  return (
    <div
      className="checkerboard relative select-none overflow-hidden rounded-xl border border-border"
      style={{ aspectRatio: aspect }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={before}
        alt={beforeLabel}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />

      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary"
        style={{ left: `${pos}%` }}
      >
        <span className="absolute top-1/2 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background/80" />
      </div>

      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px]">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px]">
        {afterLabel}
      </span>

      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label={t('label')}
        className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0"
      />
    </div>
  );
}
