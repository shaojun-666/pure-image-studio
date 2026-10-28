'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminStats } from '@/lib/hooks/use-admin';
import {
  AdminEmpty,
  AdminLoading,
  AdminPage,
  AdminTable,
  AdminTime,
  StatusBadge,
  Td,
  Th,
} from '@/components/admin/admin-ui';

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

export function AdminDashboard() {
  const t = useTranslations('admin');
  const ts = useTranslations('admin.status');
  const { data, isPending } = useAdminStats();

  if (isPending || !data) {
    return (
      <AdminPage title={t('title')} hint={t('subtitle')}>
        <AdminLoading rows={6} />
      </AdminPage>
    );
  }

  // 柱高按 14 天里的峰值归一；全 0 时给 1 避免除零
  const max = Math.max(...data.days.map((d) => d.images), 1);

  return (
    <AdminPage title={t('title')} hint={t('subtitle')}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label={t('dashboard.users')} value={data.totals.users} />
        <Metric label={t('dashboard.generations')} value={data.totals.generations} />
        <Metric label={t('dashboard.images')} value={data.totals.images} />
        <Metric label={t('dashboard.publishedPosts')} value={data.totals.publishedPosts} />
        <Metric label={t('dashboard.creditsSpent')} value={data.totals.creditsSpent} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dashboard.trend')}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('dashboard.trendHint')}</p>
        </CardHeader>
        <CardContent>
          {/* 纯 CSS 柱状图：14 根柱子不值得为此引入图表库 */}
          <div className="flex h-40 items-end gap-1.5">
            {data.days.map((d) => (
              <div key={d.day} className="group flex h-full flex-1 flex-col justify-end gap-1">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-primary/40 to-accent/70 transition-colors group-hover:from-primary/60 group-hover:to-accent"
                  style={{ height: `${Math.max((d.images / max) * 100, d.images ? 4 : 0)}%` }}
                  title={`${d.day} · ${d.generations} ${t('dashboard.generationUnit')} · ${d.images} ${t('dashboard.imageUnit')}`}
                />
                <span className="text-center text-[10px] tabular-nums text-muted-foreground">
                  {d.day.slice(8)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{t('dashboard.recent')}</CardTitle>
            <Link href="/admin/generations" className="text-xs text-primary hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentGenerations.length === 0 ? (
              <AdminEmpty text={t('common.empty')} />
            ) : (
              <AdminTable>
                <thead>
                  <tr>
                    <Th>{t('generations.status')}</Th>
                    <Th>{t('models.title')}</Th>
                    <Th>{t('users.email')}</Th>
                    <Th>{t('generations.createdAt')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentGenerations.map((g) => (
                    <tr key={g.id}>
                      <Td>
                        <StatusBadge value={g.status} label={ts(g.status)} />
                      </Td>
                      <Td className="font-mono text-xs">{g.modelId}</Td>
                      <Td className="max-w-[14rem] truncate">{g.email}</Td>
                      <Td>
                        <AdminTime iso={g.createdAt} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.audit')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.audit.length === 0 ? (
              <AdminEmpty text={t('dashboard.auditEmpty')} />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.audit.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-0"
                  >
                    <span className="font-mono text-xs text-primary">{a.action}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {a.targetType} · {a.targetId.slice(0, 8)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {a.admin.email.split('@')[0]}
                    </span>
                    <AdminTime iso={a.createdAt} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminPage>
  );
}
