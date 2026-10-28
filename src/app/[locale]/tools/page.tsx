import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Expand, Maximize2, Paintbrush, Palette, Scissors, Wand2 } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';

const TOOLS = [
  { slug: 'background-removal', key: 'backgroundRemoval', Icon: Scissors },
  { slug: 'upscale', key: 'upscale', Icon: Maximize2 },
  { slug: 'inpaint', key: 'inpaint', Icon: Paintbrush },
  { slug: 'outpaint', key: 'outpaint', Icon: Expand },
  { slug: 'object-removal', key: 'objectRemoval', Icon: Wand2 },
  { slug: 'style-transfer', key: 'styleTransfer', Icon: Palette },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.tools' });
  return buildMetadata({
    locale,
    path: '/tools',
    title: t('title'),
    description: t('description'),
  });
}

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'tools' });

  return (
    <div className="container space-y-8 py-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map(({ slug, key, Icon }) => (
          <Link
            key={slug}
            href={`/tools/${slug}`}
            className="group rounded-2xl border border-border bg-card/40 p-5 transition-colors hover:border-primary/50 hover:bg-card/70"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <h2 className="mt-4 font-medium">{t(`items.${key}.name`)}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t(`items.${key}.desc`)}
            </p>
            <span className="mt-4 inline-block text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
              {t('open')}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
