import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { UpscaleTool } from '@/components/editor/tool-pages';
import { buildMetadata } from '@/lib/seo';
import { auth } from '@/server/auth';

const PATH = '/tools/upscale';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tools.items.upscale' });
  return buildMetadata({ locale, path: PATH, title: t('name'), description: t('desc') });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (!(await auth())?.user?.id) redirect(`/${locale}/login`);

  const t = await getTranslations({ locale, namespace: 'tools.items.upscale' });

  return (
    <div className="container space-y-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('desc')}</p>
      </header>
      <UpscaleTool />
    </div>
  );
}
