import { Skeleton } from '@/components/ui/skeleton';

/**
 * 生成器是全站停留最久的页面，也是 dev 下冷编译最贵的一个。
 * 骨架按 GeneratorShell 的三段式布局摆：模式 Tab → 提示词栏 → 左控制栏 + 右结果网格。
 */

const TAB_WIDTHS = ['w-[88px]', 'w-24', 'w-20', 'w-[104px]', 'w-[72px]', 'w-[92px]', 'w-[84px]', 'w-24'];
const CONTROL_HEIGHTS = ['h-14', 'h-[92px]', 'h-[72px]', 'h-16', 'h-[120px]'];

export default function GenerateLoading() {
  return (
    <div className="container space-y-6 py-8">
      {/* 模式 Tab */}
      <div className="flex gap-2 overflow-hidden">
        {TAB_WIDTHS.map((w, i) => (
          <Skeleton key={i} className={`h-9 shrink-0 ${w}`} />
        ))}
      </div>
      {/* 提示词栏 */}
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* 左：模型 / 画幅 / 分辨率 / 批量 / 风格 */}
        <div className="space-y-4">
          {CONTROL_HEIGHTS.map((h, i) => (
            <Skeleton key={i} className={`w-full ${h}`} />
          ))}
        </div>
        {/* 右：结果网格，与 ResultGrid 的断点一致 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
