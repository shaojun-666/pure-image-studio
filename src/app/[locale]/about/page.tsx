import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, Languages, Layers, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { env } from '@/server/env';

const VALUE_ICONS = {
  workbench: Layers,
  capability: ShieldCheck,
  bilingual: Languages,
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.about' });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `${base}/${locale}/about`,
      languages: {
        zh: `${base}/zh/about`,
        en: `${base}/en/about`,
        'x-default': `${base}/zh/about`,
      },
    },
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('about');
  const valueKeys = Object.keys(VALUE_ICONS) as (keyof typeof VALUE_ICONS)[];

  return (
    <div>
      {/* ── Hero ── */}
      <section className="container pt-20 pb-16 text-center sm:pt-28">
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          <span className="text-gradient">{t('title')}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t('subtitle')}
        </p>
      </section>

      {/* ── 取舍 ── */}
      <section className="container pb-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('valuesTitle')}
          </h2>
          <p className="mt-3 text-muted-foreground">{t('valuesSubtitle')}</p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {valueKeys.map((key) => {
            const Icon = VALUE_ICONS[key];
            return (
              <div
                key={key}
                className="rounded-2xl border border-border/60 bg-card/50 p-6 transition-colors hover:border-primary/40"
              >
                <span className="inline-grid h-10 w-10 place-items-center rounded-xl border border-border/60 bg-gradient-to-br from-primary/20 to-accent/10">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <h3 className="mt-4 text-base font-medium">
                  {t(`values.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`values.${key}.desc`)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 技术说明 ── */}
      <section className="container pb-16">
        <div className="glass mx-auto max-w-3xl rounded-3xl p-8 sm:p-10">
          <h2 className="text-xl font-semibold tracking-tight">
            {t('techTitle')}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t('techDesc')}
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
            {t('ctaSubtitle', { bonus: env.SIGNUP_BONUS_CREDITS })}
          </p>
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
