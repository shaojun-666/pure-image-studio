import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
// 用 next/navigation 的 redirect 而不是 i18n 版本的：它带显式 : never 返回类型，
// TS 才能把后面的 session 收窄成非空（i18n 的 redirect 来自解构，不做 never 收窄）。
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { auth } from '@/server/auth';
import { prisma } from '@/server/db';
import { env } from '@/server/env';
import { claimDailyGrant, nextBeijingMidnight } from '@/server/credits/daily-grant';
import { buildMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** 概览只放最近几条，完整流水在 /account/credits */
const LEDGER_PAGE_SIZE = 5;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account' });
  return buildMetadata({
    locale,
    path: '/account',
    title: t('title'),
    description: t('subtitle'),
    noIndex: true,
  });
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  const userId = session.user.id;

  // 进入账户页即补齐当日免费额度：不依赖 cron
  const grant = await claimDailyGrant(userId);

  const [user, ledger, totals] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, creditBalance: true, createdAt: true },
    }),
    prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: LEDGER_PAGE_SIZE,
      select: { id: true, kind: true, delta: true, balanceAfter: true, createdAt: true },
    }),
    prisma.creditLedger.groupBy({
      by: ['kind'],
      where: { userId },
      _sum: { delta: true },
    }),
  ]);

  const t = await getTranslations('account');
  const format = await getFormatter();

  const earned = totals.reduce((n, g) => (g._sum.delta && g._sum.delta > 0 ? n + g._sum.delta : n), 0);
  const spent = totals.reduce((n, g) => (g._sum.delta && g._sum.delta < 0 ? n + g._sum.delta : n), 0);

  const nextAt = nextBeijingMidnight();

  return (
    <div className="max-w-4xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href="/generate"
          className={cn(buttonVariants({ size: 'lg' }), 'shrink-0')}
        >
          {t('goGenerate')}
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('balance')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold tabular-nums text-gradient">
              {user.creditBalance}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t('creditsUnit')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dailyGrant')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-semibold tabular-nums">+{env.DAILY_FREE_CREDITS}</p>
            <p className="text-xs text-muted-foreground">
              {grant.granted > 0
                ? t('dailyGrantActive', { amount: grant.granted })
                : t('dailyGrantNext', { time: format.relativeTime(nextAt) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('totalEarned')} / {t('totalSpent')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-semibold tabular-nums text-emerald-400">+{earned}</p>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">{spent}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">{t('ledger')}</CardTitle>
          <Link
            href="/account/credits"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t('viewAllLedger')} →
          </Link>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('ledgerEmpty')}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {ledger.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t(`kinds.${row.kind}` as 'kinds.SIGNUP_BONUS')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(row.createdAt, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        row.delta > 0 ? 'text-emerald-400' : 'text-foreground'
                      }`}
                    >
                      {row.delta > 0 ? `+${row.delta}` : row.delta}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t('ledgerBalanceAfter', { value: row.balanceAfter })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t('memberSince', {
          date: format.dateTime(user.createdAt, { dateStyle: 'long' }),
        })}
      </p>
    </div>
  );
}
