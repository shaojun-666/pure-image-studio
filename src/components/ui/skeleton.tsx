import { cn } from '@/lib/utils';

/** 带紫青扫光的骨架块。放在相对定位容器里即自动铺满。 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-lg bg-secondary/60', className)} />;
}
