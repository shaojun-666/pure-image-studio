import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  ArrowRight,
  Grid2x2,
  History,
  Layers,
  MessageSquareText,
  Palette,
  Wand2,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { HeroShowcase, ShowcaseWall } from '@/components/home/showcase-wall';

const FEATURE_ICONS = {
  modes: Wand2,
  styles: Palette,
  models: Layers,
  prompt: MessageSquareText,
  batch: Grid2x2,
  history: History,
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.home' });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `${base}/${locale}`,
      languages: {
        zh: `${base}/zh`,
        en: `${base}/en`,
        'x-default': `${base}/zh`,
      },
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');
  const featureKeys = Object.keys(FEATURE_ICONS) as (keyof typeof FEATURE_ICONS)[];

  return (
    <div>
      {/* ── Hero ── */}
      <section className="container relative pt-20 pb-24 text-center sm:pt-28">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/40 px-3.5 py-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {t('badge')}
        </div>

        <h1 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
          <span className="text-gradient">{t('title')}</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t('subtitle')}
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/generate"
            className="ring-glow group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            {t('ctaPrimary')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-6 py-3 text-sm font-medium transition-colors hover:bg-secondary"
          >
            {t('ctaSecondary')}
          </Link>
        </div>

        {/* 用真实作品当首屏视觉预告，鼠标移动时整排按纵深错位 */}
        <HeroShowcase />
      </section>

      {/* ── 能力矩阵 ── */}
      <section className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('featuresTitle')}
          </h2>
          <p className="mt-3 text-muted-foreground">{t('featuresSubtitle')}</p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featureKeys.map((key) => {
            const Icon = FEATURE_ICONS[key];
            return (
              <div
                key={key}
                className="group rounded-2xl border border-border/60 bg-card/50 p-6 transition-colors hover:border-primary/40"
              >
                <span className="inline-grid h-10 w-10 place-items-center rounded-xl border border-border/60 bg-gradient-to-br from-primary/20 to-accent/10">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <h3 className="mt-4 text-base font-medium">
                  {t(`features.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`features.${key}.desc`)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 作品流 ── */}
      <section className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('showcaseTitle')}
          </h2>
          <p className="mt-3 text-muted-foreground">{t('showcaseSubtitle')}</p>
        </div>

        <ShowcaseWall />

        <div className="mt-10 text-center">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-6 py-3 text-sm font-medium transition-colors hover:bg-secondary"
          >
            {t('ctaSecondary')}
            <ArrowRight className="h-4 w-4" />
          </Link>
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
          <p className="relative mt-3 text-muted-foreground">{t('ctaSubtitle')}</p>
          <Link
            href="/register"
            className="ring-glow relative mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            {t('ctaPrimary')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
