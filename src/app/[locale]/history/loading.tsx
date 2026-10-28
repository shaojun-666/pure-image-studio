import { Skeleton } from '@/components/ui/skeleton';

/** 生成历史要按游标查库，详情页（history/[id]）共用这个边界 */

const FILTER_WIDTHS = ['w-20', 'w-24', 'w-[72px]', 'w-[88px]'];

export default function HistoryLoading() {
  return (
    <div className="container space-y-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28" />
      </header>
      {/* 筛选栏 */}
      <div className="flex gap-2">
        {FILTER_WIDTHS.map((w, i) => (
          <Skeleton key={i} className={`h-8 ${w}`} />
        ))}
      </div>
      {/* 结果网格：与 ResultGrid 的 2/3/4 列断点保持一致 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-square w-full" />
        ))}
      </div>
    </div>
  );
}
