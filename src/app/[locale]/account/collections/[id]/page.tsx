import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { CollectionDetail } from '@/components/account/collection-detail';

/** 集合名要登录后才知道，标题统一用「集合详情」，不进索引。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account.collections' });
  return buildMetadata({
    locale,
    path: '/account/collections',
    title: t('detailTitle'),
    noIndex: true,
  });
}

export default async function AccountCollectionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <CollectionDetail id={id} />;
}
