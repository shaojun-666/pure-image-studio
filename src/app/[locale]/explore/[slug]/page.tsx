import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { findPublishedPost, serializeDetail } from '@/server/explore';
import { buildMetadata } from '@/lib/seo';
import { pickI18n } from '@/lib/i18n';
import { ExploreDetail } from '@/components/explore/explore-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await findPublishedPost(slug);
  if (!post) return { title: 'Not Found', robots: { index: false, follow: false } };

  return buildMetadata({
    locale,
    path: `/explore/${slug}`,
    title: pickI18n(post.titleI18n, locale),
    description: pickI18n(post.descriptionI18n, locale) || undefined,
  });
}

export default async function ExploreDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  // 未发布或不存在一律走 404 —— 公开页软 404（200 空页）会被搜索引擎判为垃圾内容
  const post = await findPublishedPost(slug);
  if (!post) notFound();

  return (
    <div className="container py-8">
      <ExploreDetail post={serializeDetail(post)} />
    </div>
  );
}
