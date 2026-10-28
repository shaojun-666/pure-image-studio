import { prisma } from './db';
import { cursorArgs, slicePage } from './pagination';
import { storage } from './storage';
import type { ExploreParams } from '@/types/generator';

/**
 * 探索内容的序列化。
 *
 * titleI18n / descriptionI18n 原样回给客户端，由 `@/lib/i18n` 的 pickI18n 挑语言 ——
 * 响应因此与语言无关，同一份缓存中英文都能用（与 /api/models 一致）。
 *
 * coverUrl 每次现算，绝不入库：本地驱动是 /api/files/public/...，
 * 生产是 CDN 域名 + key，签名会过期而库里那份不会。
 */
export interface ExploreCardRow {
  id: string;
  slug: string;
  titleI18n: unknown;
  descriptionI18n: unknown;
  coverKey: string;
  tags: string[];
  category: string | null;
  featured: boolean;
  modelId: string | null;
  params: unknown;
  viewCount: number;
  likeCount: number;
  publishedAt: Date | null;
}

/** 从 params 里取宽高比：瀑布流卡片靠它先占位，避免图加载时页面跳动 */
function aspectOf(params: unknown): string {
  const p = params as ExploreParams | null;
  return p?.aspectRatio ?? '1:1';
}

/**
 * 详情要用的字段。API 路由和 /explore/[slug] 页共用这一份 ——
 * 分两处写迟早会漏字段，而漏了 stylePresetId 的后果是「一键同款」静默丢风格。
 */
const DETAIL_SELECT = {
  id: true,
  slug: true,
  titleI18n: true,
  descriptionI18n: true,
  coverKey: true,
  tags: true,
  category: true,
  featured: true,
  modelId: true,
  stylePresetId: true,
  params: true,
  viewCount: true,
  likeCount: true,
  publishedAt: true,
  prompt: true,
  negativePrompt: true,
};

const LIST_SELECT = {
  id: true,
  slug: true,
  titleI18n: true,
  descriptionI18n: true,
  coverKey: true,
  tags: true,
  category: true,
  featured: true,
  modelId: true,
  params: true,
  viewCount: true,
  likeCount: true,
  publishedAt: true,
};

export interface ExploreListQuery {
  cursor?: string;
  limit: number;
  category?: string;
  tag?: string;
  sort?: 'latest' | 'popular';
  featured?: boolean;
}

/**
 * 列表查询。/api/explore 与 `/explore` 页的服务端首屏共用这一份 ——
 * where/orderBy 一旦分成两处，某天改了筛选条件的语义就会出现「首屏和翻页结果不一致」。
 */
export async function listPublishedPosts(q: ExploreListQuery) {
  const rows = await prisma.explorePost.findMany({
    where: {
      status: 'PUBLISHED',
      ...(q.category ? { category: q.category } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(q.featured === undefined ? {} : { featured: q.featured }),
    },
    // 游标是 id，排序键必须唯一稳定，否则游标翻页会漏条或重复
    orderBy:
      q.sort === 'popular'
        ? [{ likeCount: 'desc' }, { id: 'desc' }]
        : [{ publishedAt: 'desc' }, { id: 'desc' }],
    ...cursorArgs(q.cursor, q.limit),
    select: LIST_SELECT,
  });

  return slicePage(rows.map(serializeCard), q.limit);
}

export async function findPublishedPost(slug: string) {
  return prisma.explorePost.findFirst({ where: { slug, status: 'PUBLISHED' }, select: DETAIL_SELECT });
}

export function serializeCard(p: ExploreCardRow) {
  return {
    id: p.id,
    slug: p.slug,
    // 两个 JSON 列在库里是无类型的，形状由写入方（seed / 后台）保证，这里断言一次
    titleI18n: (p.titleI18n ?? {}) as Record<string, string>,
    descriptionI18n: (p.descriptionI18n ?? null) as Record<string, string> | null,
    coverUrl: storage.publicUrl(p.coverKey),
    tags: p.tags,
    category: p.category,
    featured: p.featured,
    modelId: p.modelId,
    aspectRatio: aspectOf(p.params),
    viewCount: p.viewCount,
    likeCount: p.likeCount,
    publishedAt: p.publishedAt?.toISOString() ?? null,
  };
}

export type ExploreCard = ReturnType<typeof serializeCard>;

export function serializeDetail(
  p: ExploreCardRow & {
    prompt: string;
    negativePrompt: string | null;
    stylePresetId: string | null;
  },
) {
  return {
    ...serializeCard(p),
    prompt: p.prompt,
    negativePrompt: p.negativePrompt,
    stylePresetId: p.stylePresetId,
    params: (p.params ?? {}) as ExploreParams,
  };
}

export type ExploreDetail = ReturnType<typeof serializeDetail>;
