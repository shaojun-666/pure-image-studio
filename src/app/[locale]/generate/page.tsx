import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GeneratorShell } from '@/components/generator/generator-shell';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.generate' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}/generate`,
      languages: { zh: '/zh/generate', en: '/en/generate' },
    },
  };
}

export default async function GeneratePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="container py-8">
      <GeneratorShell />
    </div>
  );
}
