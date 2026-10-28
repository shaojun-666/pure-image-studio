'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 纯 CSS 提示。用 group-hover + focus-visible 双通道，
 * 键盘 Tab 到也能看到，且不产生任何 portal / 定位计算。
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  if (!content) return <>{children}</>;

  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-56 -translate-x-1/2 rounded-lg px-2.5 py-1.5',
          'text-xs leading-snug text-foreground',
          'glass opacity-0 transition-opacity duration-150',
          'group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {content}
      </span>
    </span>
  );
}
