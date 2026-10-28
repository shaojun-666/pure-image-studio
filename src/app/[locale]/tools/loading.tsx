import { Skeleton } from '@/components/ui/skeleton';

/** 6 个工具页共用这一个边界：都是「上传 → 单模式生成 → 前后对比」的同一套外壳 */

const PARAM_WIDTHS = ['w-28', 'w-24', 'w-32', 'w-[88px]'];

export default function ToolsLoading() {
  return (
    <div className="container space-y-6 py-8">
      <header>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-2 h-4 w-80" />
      </header>
      {/* ToolShell 的上传区 + 参数栏 */}
      <Skeleton className="h-64 w-full" />
      <div className="flex flex-wrap gap-3">
        {PARAM_WIDTHS.map((w, i) => (
          <Skeleton key={i} className={`h-9 ${w}`} />
        ))}
      </div>
    </div>
  );
}
