import { Skeleton } from '@/components/ui/skeleton';

/**
 * 账户页要 auth() + 补齐当日赠送 + 查流水，是全站最重的服务端页面之一。
 * 它还会 redirect 未登录用户，骨架在这条路径上同样会先闪一下 —— 无伤大雅。
 */
export default function AccountLoading() {
  return (
    <div className="container space-y-6 py-8">
      <header>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-2 h-4 w-64" />
      </header>
      {/* 余额 / 每日赠送 / 用量 三张卡 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
      {/* 最近流水 */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
