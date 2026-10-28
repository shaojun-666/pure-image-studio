'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

export interface Expand {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_EXPAND: Expand = { top: 0, right: 0, bottom: 0, left: 0 };

const HANDLES = [
  { id: 'nw', x: 0, y: 0 },
  { id: 'n', x: 0.5, y: 0 },
  { id: 'ne', x: 1, y: 0 },
  { id: 'w', x: 0, y: 0.5 },
  { id: 'e', x: 1, y: 0.5 },
  { id: 'sw', x: 0, y: 1 },
  { id: 's', x: 0.5, y: 1 },
  { id: 'se', x: 1, y: 1 },
] as const;

/**
 * 扩图 8 向手柄。输出的是**源图坐标系像素**，不是屏幕像素 ——
 * 因此窗口缩放不影响结果，服务端拿到的 expand 始终与源图同尺度。
 *
 * 画面分两层：源图居中不动，虚线框是外扩后的输出画布，手柄长在虚线框上。
 */
export function ExpandHandles({
  src,
  width,
  height,
  expand,
  max,
  onChange,
  disabled,
}: {
  src: string;
  width: number;
  height: number;
  expand: Expand;
  /** 单边最大外扩像素 */
  max: number;
  onChange: (e: Expand) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('tools.outpaint');
  const frameRef = React.useRef<HTMLDivElement>(null);

  // 画布尺寸固定为「源图 + 四周各 max」，拖动时不会跟着变，视觉上更稳
  const sceneW = width + max * 2;
  const sceneH = height + max * 2;
  const pctX = (v: number) => `${(v / sceneW) * 100}%`;
  const pctY = (v: number) => `${(v / sceneH) * 100}%`;

  const box = {
    left: max - expand.left,
    top: max - expand.top,
    width: width + expand.left + expand.right,
    height: height + expand.top + expand.bottom,
  };

  const startDrag = (e: React.PointerEvent, h: (typeof HANDLES)[number]) => {
    if (disabled) return;
    e.preventDefault();
    const frame = frameRef.current;
    if (!frame) return;

    // 拖动过程中容器尺寸不变，比例只在按下时量一次
    const scale = frame.clientWidth / sceneW;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const base = { ...expand };
    const clamp = (v: number) => Math.max(0, Math.min(max, Math.round(v)));

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / scale;
      const dy = (ev.clientY - y0) / scale;
      onChange({
        left: h.x === 0 ? clamp(base.left - dx) : base.left,
        right: h.x === 1 ? clamp(base.right + dx) : base.right,
        top: h.y === 0 ? clamp(base.top - dy) : base.top,
        bottom: h.y === 1 ? clamp(base.bottom + dy) : base.bottom,
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        className="relative select-none overflow-hidden rounded-xl border border-border bg-black/50"
        style={{ aspectRatio: `${sceneW} / ${sceneH}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="absolute object-contain"
          style={{
            left: pctX(max),
            top: pctY(max),
            width: pctX(width),
            height: pctY(height),
          }}
        />

        {/* 输出画布边界 */}
        <div
          className="pointer-events-none absolute border border-dashed border-primary/70"
          style={{
            left: pctX(box.left),
            top: pctY(box.top),
            width: pctX(box.width),
            height: pctY(box.height),
          }}
        />

        {HANDLES.map((h) => (
          <button
            key={h.id}
            type="button"
            aria-label={t('handle', { dir: h.id })}
            data-handle={h.id}
            disabled={disabled}
            onPointerDown={(e) => startDrag(e, h)}
            className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-background bg-primary shadow active:cursor-grabbing disabled:opacity-40"
            style={{
              left: pctX(box.left + h.x * box.width),
              top: pctY(box.top + h.y * box.height),
            }}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground tabular-nums">
        {t('outputSize', { w: Math.round(box.width), h: Math.round(box.height) })}
      </p>
    </div>
  );
}

/**
 * 扩图编辑器的有状态外壳：手柄本身是无状态的，扩展量得有人拿着。
 *
 * `key={init.id}` 让换底图时 React 直接重建本组件，扩展量随组件归零。
 * 不能在 render 里 setState 重置：调用方是在**它自己的** render 中渲染这个组件的，
 * 在那里改状态等于「渲染期间更新另一个组件」，React 会告警。
 *
 * 工具页和生成器共用这一段，所以放在手柄旁边，而不是各写一份。
 */
export function OutpaintEditor({
  init,
  valueRef,
}: {
  init: { url: string; width: number; height: number };
  /** 提交时从这个口取当前扩展量；本组件的 state 只负责重绘 */
  valueRef: React.RefObject<Expand>;
}) {
  const [expand, setExpand] = React.useState<Expand>(NO_EXPAND);

  // 重建时把外部取值口一并归零，否则换图后取到的仍是上一张的扩展量
  React.useEffect(() => {
    valueRef.current = NO_EXPAND;
  }, [valueRef]);

  const change = (e: Expand) => {
    setExpand(e);
    valueRef.current = e;
  };

  return (
    <ExpandHandles
      src={init.url}
      width={init.width}
      height={init.height}
      expand={expand}
      max={Math.min(1024, Math.round(Math.min(init.width, init.height) * 0.75))}
      onChange={change}
    />
  );
}
