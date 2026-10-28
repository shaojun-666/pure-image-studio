'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * 用原生 range 实现：键盘可达、移动端手势天然可用，代价是样式要自己画。
 * 进度色靠 `--p` 变量喂给轨道渐变，避免额外的 DOM 层。
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  className,
  ...rest
}: SliderProps) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValueChange(Number(e.target.value))}
      style={{ '--p': `${pct}%` } as React.CSSProperties}
      className={cn(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none',
        'bg-[linear-gradient(90deg,hsl(var(--primary))_var(--p),hsl(var(--secondary))_var(--p))]',
        '[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
        '[&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_hsl(var(--primary)/0.35)]',
        '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full',
        '[&::-moz-range-thumb]:bg-foreground',
        'focus-visible:[&::-webkit-slider-thumb]:shadow-[0_0_0_5px_hsl(var(--primary)/0.45)]',
        className,
      )}
      {...rest}
    />
  );
}
