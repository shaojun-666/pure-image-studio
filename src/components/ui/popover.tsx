'use client';

import * as React from 'react';
import { useDismiss } from '@/lib/hooks/use-dismiss';
import { cn } from '@/lib/utils';

interface PopoverProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  /** 面板宽度：默认跟随触发器 */
  className?: string;
  contentClassName?: string;
}

/** 轻量下拉容器：绝对定位 + 点击外部关闭。内容宽度由调用方决定。 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = 'start',
  className,
  contentClassName,
}: PopoverProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  useDismiss(open, () => onOpenChange(false), ref);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-2 min-w-full origin-top rounded-xl p-1',
            'glass shadow-2xl shadow-black/50',
            'animate-in fade-in-0 zoom-in-95',
            align === 'end' ? 'right-0' : 'left-0',
            contentClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function PopoverItem({
  className,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        active ? 'bg-primary/15 text-foreground' : 'hover:bg-accent/10',
        className,
      )}
      {...props}
    />
  );
}
