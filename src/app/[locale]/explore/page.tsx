import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/server/db';
import { listPublishedPosts } from '@/server/explore';
import { buildMetadata } from '@/lib/seo';
import { ExploreGrid } from '@/components/explore/explore-grid';

/**
 * 强制动态渲染。本页在渲染期就要查库，而 `pnpm build` 会预渲染所有没有动态 API 的页面 ——
 * Docker 构建阶段没有数据库，静态化会让构建直接失败。探索页是公开只读的，按请求渲染足够便宜。
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.explore' });
  return buildMetadata({
    locale,
    path: '/explore',
    title: t('title'),
    description: t('description'),
  });
}

export default async function ExplorePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'explore' });

  // 分类 Tab 的数据在服务端一次查好，客户端就不用为了几个标签再往返一趟
  const groups = await prisma.explorePost.groupBy({
    by: ['category'],
    where: { status: 'PUBLISHED' },
    _count: { _all: true },
    orderBy: { category: 'asc' },
  });
  const categories = groups.flatMap((g) =>
    g.category ? [{ category: g.category, count: g._count._all }] : [],
  );

  // 首屏内容随 HTML 一起吐出去：百度不执行 JS，纯客户端取数的页面在它眼里是空的。
  // 24 必须与 useExplore 的 limit 一致，否则首屏数据和客户端翻页会对不上。
  const initial = await listPublishedPosts({ limit: 24 });

  return (
    <div className="container space-y-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ExploreGrid categories={categories} initial={initial} />
    </div>
  );
}
