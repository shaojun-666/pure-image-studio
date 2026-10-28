'use client';

import { useEffect, useState } from 'react';

/** 搜索框 / 滑块的防抖值，避免每敲一个字就打一次接口 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
