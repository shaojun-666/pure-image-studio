'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 基于原生 <dialog>：焦点陷阱、Esc 关闭、 inert 背景全都由浏览器负责，
 * 这是手写弹窗里最容易写错的部分，交给标准元素最省事。
 * `showModal()` 需要命令式调用，所以这里在 open 变化时同步。
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations('common');
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        // 点遮罩关闭：dialog 自身铺满视口，只有点在它上面才算遮罩
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'z-50 m-auto w-[min(92vw,42rem)] rounded-2xl p-0 text-foreground',
        'glass shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
        <div>
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
