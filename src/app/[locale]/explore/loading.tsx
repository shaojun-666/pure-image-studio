import { Skeleton } from '@/components/ui/skeleton';

/**
 * 探索页在服务端要查两次库（分类聚合 + 首屏 24 条），冷启动时能到 1s 以上。
 * 没有 loading 边界的话这段时间界面完全不动，手感就是"点了没反应"。
 */

// 类名字面量必须写死在源码里，Tailwind 才扫得到（拼 h-[${h}px] 不会生成）
const CARD_HEIGHTS = [
  'h-[260px]',
  'h-[200px]',
  'h-[300px]',
  'h-[240px]',
  'h-[280px]',
  'h-[220px]',
  'h-[320px]',
  'h-[260px]',
];

export default function ExploreLoading() {
  return (
    <div className="container space-y-6 py-8">
      <header>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </header>
      {/* 与 ExploreGrid 的瀑布流同构：CSS columns，卡片高度错落 */}
      <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
        {CARD_HEIGHTS.map((h, i) => (
          <Skeleton key={i} className={`mb-4 w-full break-inside-avoid ${h}`} />
        ))}
      </div>
    </div>
  );
}
