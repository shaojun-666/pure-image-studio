import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, CalendarClock, Gift } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { env } from '@/server/env';
import { CREDIT_CONFIG } from '@/lib/ai/pricing';
import type { GenerationMode } from '@/lib/ai/contracts';

/**
 * 倍率表自己就是模式清单的来源：`satisfies Record<GenerationMode, number>`
 * 保证它不漏模式，所以这里按它的键渲染，不会出现"加了模式但定价页没跟上"。
 */
const MODES = Object.keys(CREDIT_CONFIG.modeMultiplier) as GenerationMode[];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.pricing' });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `${base}/${locale}/pricing`,
      languages: {
        zh: `${base}/zh/pricing`,
        en: `${base}/en/pricing`,
        'x-default': `${base}/zh/pricing`,
      },
    },
  };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('pricing');
  // 模式的显示名和说明复用生成器里那一套，不在这里重复定义
  const tg = await getTranslations('generator');

  // 额度读 env：后台改了 SIGNUP_BONUS_CREDITS / DAILY_FREE_CREDITS 这里跟着变
  const grants = [
    { key: 'signup', Icon: Gift, amount: env.SIGNUP_BONUS_CREDITS },
    { key: 'daily', Icon: CalendarClock, amount: env.DAILY_FREE_CREDITS },
  ] as const;

  return (
    <div>
      {/* ── Hero ── */}
      <section className="container pt-20 pb-14 text-center sm:pt-28">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/40 px-3.5 py-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {t('freeBadge')}
        </div>

        <h1 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
          <span className="text-gradient">{t('title')}</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t('subtitle', {
            bonus: env.SIGNUP_BONUS_CREDITS,
            daily: env.DAILY_FREE_CREDITS,
          })}
        </p>
      </section>

      {/* ── 免费额度 ── */}
      <section className="container py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('grantsTitle')}
          </h2>
          <p className="mt-3 text-muted-foreground">{t('grantsSubtitle')}</p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-2">
          {grants.map(({ key, Icon, amount }) => (
            <div
              key={key}
              className="rounded-2xl border border-border/60 bg-card/50 p-6 transition-colors hover:border-primary/40"
            >
              <span className="inline-grid h-10 w-10 place-items-center rounded-xl border border-border/60 bg-gradient-to-br from-primary/20 to-accent/10">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <div className="mt-4 flex items-baseline gap-2">
                <h3 className="text-base font-medium">
                  {t(`grants.${key}.title`)}
                </h3>
                <span className="text-2xl font-semibold tabular-nums text-primary">
                  +{amount}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t('unit')}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`grants.${key}.desc`)}
              </p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-muted-foreground">
          {t('dailyNote')}
        </p>
      </section>

      {/* ── 消耗规则 ── */}
      <section className="container py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('costTitle')}
          </h2>
          <p className="mt-3 text-muted-foreground">{t('costSubtitle')}</p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">
                  {t('modeColumn')}
                </th>
                {/* 窄屏塞不下三列，说明列先收起来，名字和倍率留着 */}
                <th className="hidden px-5 py-3 text-left font-medium sm:table-cell">
                  {t('descColumn')}
                </th>
                <th className="px-5 py-3 text-right font-medium">
                  {t('multiplierColumn')}
                </th>
              </tr>
            </thead>
            <tbody>
              {MODES.map((mode) => (
                <tr key={mode} className="border-t border-border/60">
                  <td className="px-5 py-3 font-medium">{tg(`modes.${mode}`)}</td>
                  <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">
                    {tg(`modeHints.${mode}`)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {t('multiplier', {
                      value: CREDIT_CONFIG.modeMultiplier[mode],
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-muted-foreground">
          {t('modelPriceHint')}
        </p>
      </section>

      {/* ── 付费说明：没有收银台，就把话说明白 ── */}
      <section className="container py-16">
        <div className="glass mx-auto max-w-3xl rounded-3xl p-8 sm:p-10">
          <h2 className="text-xl font-semibold tracking-tight">
            {t('payTitle')}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t('payDesc')}
          </p>
        </div>
      </section>

      {/* ── 底部 CTA ── */}
      <section className="container pb-8 pt-4">
        <div className="glass relative overflow-hidden rounded-3xl px-8 py-14 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[36rem] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl"
          />
          <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('ctaTitle')}
          </h2>
          <p className="relative mt-3 text-muted-foreground">
            {t('ctaSubtitle')}
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="ring-glow inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              {t('ctaPrimary')}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-6 py-3 text-sm font-medium transition-colors hover:bg-secondary"
            >
              {t('ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
