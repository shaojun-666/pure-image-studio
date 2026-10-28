'use client';

import * as React from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import { useLedger, useMe, useMeStats } from '@/lib/hooks/use-catalog';
import { cn } from '@/lib/utils';
import type { LedgerRowDTO } from '@/types/generator';

/**
 * 近 14 天净消耗。刻意用纯 CSS 柱条而不是图表库：
 * 一条 14 根的柱状图不值得为此引入几百 KB 的依赖。
 */
function UsageChart({ days }: { days: { day: string; spent: number }[] }) {
  const t = useTranslations('account.credits');
  const format = useFormatter();
  // 全是 0 时给个 1 兜底，避免除以 0 后每根柱子都 NaN 高
  const max = Math.max(...days.map((d) => d.spent), 1);

  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {days.map((d) => (
          <div
            key={d.day}
            title={`${d.day} · ${d.spent} ${t('unit')}`}
            className="flex-1 rounded-t bg-gradient-to-t from-primary/40 to-accent/70"
            style={{ height: `${Math.max((d.spent / max) * 100, 2)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{days[0]?.day}</span>
        <span>{days.at(-1)?.day}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t('chartHint', {
          total: format.number(days.reduce((n, d) => n + d.spent, 0)),
        })}
      </p>
    </div>
  );
}

export function CreditsPanel() {
  const t = useTranslations('account.credits');
  const ta = useTranslations('account');
  const format = useFormatter();

  const { data: me } = useMe();
  const { data: stats, isPending: statsPending } = useMeStats();

  const [extra, setExtra] = React.useState<LedgerRowDTO[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { data, isPending } = useLedger();

  React.useEffect(() => {
    setExtra([]);
    setCursor(data?.nextCursor ?? null);
  }, [data]);

  const rows = [...(data?.items ?? []), ...extra];

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await apiFetch<{ items: LedgerRowDTO[]; nextCursor: string | null }>(
        `/api/me/credits/ledger?limit=20&cursor=${cursor}`,
      );
      setExtra((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {ta('balance')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold tabular-nums text-gradient">
              {me?.creditBalance ?? '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{ta('creditsUnit')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {ta('totalEarned')} / {ta('totalSpent')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-semibold tabular-nums text-emerald-400">
              +{stats?.totalEarned ?? 0}
            </p>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">
              {stats?.totalSpent ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('usage')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-semibold tabular-nums">{stats?.generations ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {t('images', { count: stats?.images ?? 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('last14d')}</CardTitle>
        </CardHeader>
        <CardContent>
          {statsPending ? <Skeleton className="h-40" /> : <UsageChart days={stats?.days ?? []} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{ta('ledger')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{ta('ledgerEmpty')}</p>
          ) : (
            <>
              <ul className="divide-y divide-border/60">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {ta(`kinds.${row.kind}` as 'kinds.SIGNUP_BONUS')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format.dateTime(new Date(row.createdAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        {row.modelId && ` · ${row.modelId}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          'text-sm font-semibold tabular-nums',
                          row.delta > 0 ? 'text-emerald-400' : 'text-foreground',
                        )}
                      >
                        {row.delta > 0 ? `+${row.delta}` : row.delta}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {ta('ledgerBalanceAfter', { value: row.balanceAfter })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {cursor && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore && <Loader2 className="animate-spin" />}
                    {t('loadMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
