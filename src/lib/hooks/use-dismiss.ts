'use client';

import { useEffect, type RefObject } from 'react';

/**
 * 点击外部 / 按 Esc 关闭浮层。
 * 手写替代 Radix 的 DismissableLayer：这里只需要这两个行为，
 * 拖一整个依赖进来不划算。
 */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, ref]);
}
