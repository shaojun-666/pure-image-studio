'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, Heart, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api-client';
import { useExplore } from '@/lib/hooks/use-catalog';
import { pickI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Paginated } from '@/types/api';
import type { ExploreCardDTO } from '@/types/generator';

/** 分类是我们自己定的受控词表（seed 与后台都从这里选），逐条本地化 */
const CATEGORIES = [
  'landscape',
  'chinese',
  'cyberpunk',
  'portrait',
  'concept',
  'anime',
  'architecture',
  'abstract',
  'interior',
  'illustration',
  'food',
  'scifi',
] as const;

const categoryLabel = (
  t: ReturnType<typeof useTranslations<'explore'>>,
  c: string,
) => ((CATEGORIES as readonly string[]).includes(c) ? t(`categories.${c}` as never) : c);

function ExploreCard({ post }: { post: ExploreCardDTO }) {
  const t = useTranslations('explore');
  const locale = useLocale();

  return (
    <Link
      href={`/explore/${post.slug}`}
      className="group mb-4 block break-inside-avoid overflow-hidden rounded-2xl border border-border/70 bg-card/40 transition-colors hover:border-primary/40"
    >
      {/* 先按 params.aspectRatio 占位，图加载完页面不会跳 */}
      <div
        className="relative overflow-hidden bg-secondary/40"
        style={{ aspectRatio: post.aspectRatio.replace(':', ' / ') }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.coverUrl}
          alt={pickI18n(post.titleI18n, locale)}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {post.featured && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
            <Sparkles className="size-3 text-primary" />
            {t('featured')}
          </span>
        )}
      </div>

      <div className="space-y-1.5 px-3 py-2.5">
        <p className="line-clamp-1 text-sm font-medium">{pickI18n(post.titleI18n, locale)}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {pickI18n(post.descriptionI18n, locale)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {post.category && <Badge variant="muted">{categoryLabel(t, post.category)}</Badge>}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Heart className="size-3" />
            {post.likeCount}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Eye className="size-3" />
            {post.viewCount}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ExploreGrid({
  categories,
  initial,
}: {
  /** 服务端先查好，省掉一次客户端往返 */
  categories: { category: string; count: number }[];
  /** 服务端渲染的首屏作品，让搜索引擎（尤其不执行 JS 的百度）也能看到内容 */
  initial: Paginated<ExploreCardDTO>;
}) {
  const t = useTranslations('explore');
  const tc = useTranslations('common');

  const [category, setCategory] = React.useState('all');
  const [sort, setSort] = React.useState<'latest' | 'popular'>('latest');
  const [featured, setFeatured] = React.useState(false);
  const [extra, setExtra] = React.useState<ExploreCardDTO[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const defaultFilter = category === 'all' && sort === 'latest' && !featured;
  const { data, isPending } = useExplore(
    { category, sort, featured },
    defaultFilter ? initial : undefined,
  );

  // 换了筛选条件就丢掉翻页累积的内容，否则会混进不符合条件的旧卡片
  React.useEffect(() => {
    setExtra([]);
    setCursor(data?.nextCursor ?? null);
  }, [data]);

  const items = [...(data?.items ?? []), ...extra];

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ cursor, limit: '24', sort });
      if (category !== 'all') qs.set('category', category);
      if (featured) qs.set('featured', '1');
      const page = await apiFetch<{ items: ExploreCardDTO[]; nextCursor: string | null }>(
        `/api/explore?${qs}`,
      );
      setExtra((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-5">
      {categories.length > 0 && (
        <Tabs
          value={category}
          onValueChange={setCategory}
          className="w-full"
          items={[
            { value: 'all', label: t('all') },
            ...categories.map((c) => ({
              value: c.category,
              label: `${categoryLabel(t, c.category)} ${c.count}`,
            })),
          ]}
        />
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={featured ? 'default' : 'outline'}
          onClick={() => setFeatured((v) => !v)}
        >
          <Sparkles className="size-3.5" />
          {t('featured')}
        </Button>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border p-0.5">
          {(['latest', 'popular'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={cn(
                'rounded-md px-3 py-1 text-xs transition-colors',
                sort === s
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(s === 'latest' ? 'sortLatest' : 'sortPopular')}
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="mb-4 h-64 break-inside-avoid" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border/70">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <Link
              href="/generate"
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t('emptyCta')}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="enter-stagger columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
            {items.map((p) => (
              <ExploreCard key={p.id} post={p} />
            ))}
          </div>

          {cursor && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="animate-spin" />}
                {loadingMore ? tc('loading') : t('loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
