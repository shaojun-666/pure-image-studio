'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsProps<T extends string> {
  value: T;
  onValueChange: (v: T) => void;
  items: { value: T; label: React.ReactNode; disabled?: boolean; hint?: string }[];
  className?: string;
  /** pill = 圆角胶囊（模式切换）；line = 下划线（次级筛选） */
  variant?: 'pill' | 'line';
}

/**
 * 受控 Tabs。刻意不做通用 compound API —— 本站只有两处用法，
 * 一个 items 数组就够，省掉一堆 Context。
 */
export function Tabs<T extends string>({
  value,
  onValueChange,
  items,
  className,
  variant = 'pill',
}: TabsProps<T>) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // 左右方向键在标签间移动，符合 ARIA tabs 的键盘约定
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.value === value);
    if (idx === -1) return;
    e.preventDefault();
    const next = enabled[(idx + (e.key === 'ArrowRight' ? 1 : enabled.length - 1)) % enabled.length];
    onValueChange(next.value);
    listRef.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn(
        'flex items-center gap-1 overflow-x-auto',
        variant === 'pill' && 'rounded-xl bg-secondary/50 p-1 ring-1 ring-inset ring-border/70',
        variant === 'line' && 'border-b border-border/70',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            data-value={item.value}
            aria-selected={active}
            disabled={item.disabled}
            title={item.hint}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'shrink-0 whitespace-nowrap text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              'disabled:cursor-not-allowed disabled:opacity-40',
              variant === 'pill' && 'rounded-lg px-3 py-1.5',
              variant === 'pill' && (active
                ? 'bg-primary/90 text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'),
              variant === 'line' && '-mb-px border-b-2 px-3 py-2.5',
              variant === 'line' && (active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'),
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
