import type { MetadataRoute } from 'next';
import { prisma } from '@/server/db';
import { SITE_URL } from '@/lib/seo';
import { routing } from '@/i18n/routing';

/**
 * 构建期不查库：`pnpm build` 跑在 Docker builder 阶段，那里没有数据库。
 * 强制动态渲染后，sitemap 在请求时现生成（爬虫访问频率很低，代价可以忽略）。
 */
export const dynamic = 'force-dynamic';

/** 公开且值得被收录的静态路由。账号/登录/历史这些要么要登录，要么无检索价值，一律不进。 */
const STATIC_PATHS: { path: string; priority: number }[] = [
  { path: '', priority: 1 },
  { path: '/generate', priority: 0.9 },
  { path: '/explore', priority: 0.9 },
  { path: '/tools', priority: 0.8 },
  { path: '/tools/background-removal', priority: 0.7 },
  { path: '/tools/upscale', priority: 0.7 },
  { path: '/tools/inpaint', priority: 0.7 },
  { path: '/tools/outpaint', priority: 0.7 },
  { path: '/tools/object-removal', priority: 0.7 },
  { path: '/tools/style-transfer', priority: 0.7 },
  { path: '/pricing', priority: 0.6 },
  { path: '/about', priority: 0.5 },
];

/**
 * 一条路径展开成两个语言版本，各自带上完整的 hreflang 交替链接。
 * 用 xhtml:link 而不是把两种语言当成互不相关的两条 URL —— 后者会被判成重复内容。
 */
function entries(
  path: string,
  priority: number,
  lastModified?: Date,
): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`]),
  );

  return routing.locales.map((locale) => ({
    url: `${SITE_URL}/${locale}${path}`,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await prisma.explorePost.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    select: { slug: true, publishedAt: true },
  });

  return [
    ...STATIC_PATHS.flatMap(({ path, priority }) => entries(path, priority)),
    ...posts.flatMap((p) =>
      entries(`/explore/${p.slug}`, 0.6, p.publishedAt ?? undefined),
    ),
  ];
}
