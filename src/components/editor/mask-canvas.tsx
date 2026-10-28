'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Eraser, Paintbrush, Redo2, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

type Pt = [number, number];
type Mode = 'preview' | 'mask';

interface Stroke {
  erase: boolean;
  /** 画笔直径，源图像素 */
  size: number;
  pts: Pt[];
}

export interface MaskCanvasHandle {
  /** 「白=编辑区 黑=保留区」的灰度 PNG；一笔都没画时返回 null */
  exportMask: () => Promise<Blob | null>;
}

const PREVIEW = 'rgba(255,64,64,0.55)';

function styleFor(ctx: CanvasRenderingContext2D, s: Stroke, mode: Mode) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.size;
  if (mode === 'mask') {
    // 导出层是灰度图：白=改、黑=留，所以「擦除」是往回涂黑而不是抠透明。
    // 两者走同一份 op-log，因此顺序与形状逐像素一致。
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.erase ? '#000' : '#fff';
  } else {
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = PREVIEW;
  }
  ctx.fillStyle = ctx.strokeStyle;
}

function segment(ctx: CanvasRenderingContext2D, s: Stroke, a: Pt, b: Pt, mode: Mode) {
  styleFor(ctx, s, mode);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, s: Stroke, p: Pt, mode: Mode) {
  styleFor(ctx, s, mode);
  ctx.beginPath();
  ctx.arc(p[0], p[1], s.size / 2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 存笔画 op-log 而不是 ImageData 快照 —— 撤销一次只回放几十条线段，
 * 而不是把 4096×4096 的位图压栈。
 */
function renderAll(canvas: HTMLCanvasElement, strokes: Stroke[], mode: Mode) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mode === 'mask') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (const s of strokes) {
    if (s.pts.length === 1) dot(ctx, s, s.pts[0], mode);
    for (let i = 1; i < s.pts.length; i++) segment(ctx, s, s.pts[i - 1], s.pts[i], mode);
  }
}

/**
 * 蒙版画笔。canvas 用源图原始分辨率，CSS 只负责缩放显示 ——
 * 导出的蒙版因此与底图逐像素对齐，缩放窗口大小不影响结果。
 */
export const MaskCanvas = React.forwardRef<
  MaskCanvasHandle,
  {
    src: string;
    width: number;
    height: number;
    disabled?: boolean;
    /** 是否有笔画，用于决定「生成」按钮能不能点；工具页不需要，所以是可选的 */
    onMaskChange?: (hasStrokes: boolean) => void;
  }
>(function MaskCanvas({ src, width, height, disabled, onMaskChange }, ref) {
  const t = useTranslations('tools.mask');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const strokes = React.useRef<Stroke[]>([]);
  const undone = React.useRef<Stroke[]>([]);
  const current = React.useRef<Stroke | null>(null);

  const [erase, setErase] = React.useState(false);
  /** 笔刷按短边百分比走：换一张不同分辨率的图不用重调 */
  const [pct, setPct] = React.useState(8);
  const [undoCount, setUndoCount] = React.useState(0);
  const [redoCount, setRedoCount] = React.useState(0);

  const brush = Math.max(2, Math.round((Math.min(width, height) * pct) / 100));

  const sync = React.useCallback(() => {
    setUndoCount(strokes.current.length);
    setRedoCount(undone.current.length);
    const c = canvasRef.current;
    if (c) renderAll(c, strokes.current, 'preview');
  }, []);

  // undoCount 就是笔画条数（sync 里跟着 strokes 一起更新），
  // 挂在它上面就不必去动 sync 的依赖数组
  React.useEffect(() => {
    onMaskChange?.(undoCount > 0);
  }, [undoCount, onMaskChange]);

  React.useImperativeHandle(
    ref,
    () => ({
      exportMask: () =>
        new Promise<Blob | null>((resolve) => {
          if (!strokes.current.length) return resolve(null);
          const off = document.createElement('canvas');
          off.width = width;
          off.height = height;
          renderAll(off, strokes.current, 'mask');
          off.toBlob((b) => resolve(b), 'image/png');
        }),
    }),
    [width, height],
  );

  const toNative = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * c.width,
      ((e.clientY - r.top) / r.height) * c.height,
    ];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const s: Stroke = { erase, size: brush, pts: [toNative(e)] };
    // 撤销过的分支一旦重新落笔就作废
    undone.current = [];
    strokes.current = [...strokes.current, s];
    current.current = s;
    dot(ctx, s, s.pts[0], 'preview');
    setUndoCount(strokes.current.length);
    setRedoCount(0);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!s) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // 增量只画最后一段，回放留给撤销/重做
    const p = toNative(e);
    segment(ctx, s, s.pts[s.pts.length - 1], p, 'preview');
    s.pts.push(p);
  };

  const onUp = () => {
    current.current = null;
  };

  const undo = () => {
    const s = strokes.current.pop();
    if (!s) return;
    undone.current.push(s);
    sync();
  };

  const redo = () => {
    const s = undone.current.pop();
    if (!s) return;
    strokes.current.push(s);
    sync();
  };

  const clear = () => {
    strokes.current = [];
    undone.current = [];
    sync();
  };

  return (
    <div className="space-y-3">
      <div
        className="checkerboard relative select-none overflow-hidden rounded-xl border border-border"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-contain" />
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label={t('canvas')}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant={erase ? 'ghost' : 'default'}
            aria-label={t('brush')}
            aria-pressed={!erase}
            onClick={() => setErase(false)}
          >
            <Paintbrush />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={erase ? 'default' : 'ghost'}
            aria-label={t('eraser')}
            aria-pressed={erase}
            onClick={() => setErase(true)}
          >
            <Eraser />
          </Button>
        </div>

        <div className="flex flex-1 items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {t('size', { px: brush })}
          </span>
          <Slider
            value={pct}
            min={2}
            max={30}
            onValueChange={setPct}
            aria-label={t('brushSize')}
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('undo')}
            disabled={!undoCount}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('redo')}
            disabled={!redoCount}
            onClick={redo}
          >
            <Redo2 />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('clear')}
            disabled={!undoCount}
            onClick={clear}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t('hint')}</p>
    </div>
  );
});
