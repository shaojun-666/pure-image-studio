'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useDismiss } from '@/lib/hooks/use-dismiss';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string> {
  value: T;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}

/**
 * 单选用它、多值/分段用 Tabs。没有做「搜索/多选/分组」——
 * 目录页的需求只有单选，加了就是没人用的代码。
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  className,
  contentClassName,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
          'border border-input bg-secondary/40 transition-colors',
          'hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'border-primary/50 ring-2 ring-ring/40',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {current?.label ?? (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-xl p-1',
            'glass shadow-2xl shadow-black/50 animate-in fade-in-0 zoom-in-95',
            'min-w-full w-max max-w-[min(24rem,90vw)]',
            contentClassName,
          )}
        >
          {options.map((o) => (
            <button
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              type="button"
              disabled={o.disabled}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-40',
                o.value === value ? 'bg-primary/15' : 'hover:bg-accent/10',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.label}</span>
                {o.hint && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {o.hint}
                  </span>
                )}
              </span>
              {o.value === value && (
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
