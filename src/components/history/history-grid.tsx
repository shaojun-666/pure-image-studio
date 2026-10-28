'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Heart, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { Select } from '@/components/ui/select';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api-client';
import { useGenerations, useModels } from '@/lib/hooks/use-catalog';
import { pickI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { GENERATION_MODES, type GenerationMode } from '@/lib/ai/contracts';
import type { GenerationDTO } from '@/types/generator';

function GenerationCard({ generation }: { generation: GenerationDTO }) {
  const t = useTranslations('history');
  const tm = useTranslations('generator.modes');
  const locale = useLocale();
  const { data: models } = useModels();
  const model = models?.find((m) => m.id === generation.modelId);

  const succeeded = generation.images.filter((i) => i.status === 'SUCCEEDED');

  return (
    <Link
      href={`/history/${generation.id}`}
      className="group block overflow-hidden rounded-2xl border border-border/70 transition-colors hover:border-primary/40"
    >
      <div
        className={cn(
          'grid gap-1 p-1',
          succeeded.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {succeeded.slice(0, 4).map((img) => (
          <div
            key={img.id}
            className="relative aspect-square overflow-hidden rounded-xl bg-secondary/40"
          >
            {img.placeholder && (
              <img
                src={img.placeholder}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
              />
            )}
            {img.thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img.thumbUrl}
                alt=""
                loading="lazy"
                className="relative h-full w-full object-cover"
              />
            )}
            {img.favorited && (
              <Heart className="absolute right-1.5 top-1.5 size-3.5 fill-rose-400 text-rose-400" />
            )}
          </div>
        ))}

        {succeeded.length === 0 && (
          <div className="grid aspect-square place-items-center rounded-xl bg-secondary/40 p-4 text-center text-xs text-muted-foreground">
            {t(`status.${generation.status}` as never)}
          </div>
        )}
      </div>

      <div className="space-y-1.5 px-3 py-2.5">
        <p className="line-clamp-1 text-sm">{generation.prompt}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="muted">{tm(generation.mode)}</Badge>
          {model && <Badge variant="outline">{pickI18n(model.displayName, locale)}</Badge>}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {new Date(generation.createdAt).toLocaleString(locale, {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function HistoryGrid() {
  const t = useTranslations('history');
  const tm = useTranslations('generator.modes');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data: models } = useModels();

  const [mode, setMode] = React.useState<GenerationMode | 'all'>('all');
  const [modelId, setModelId] = React.useState('all');
  const [favorited, setFavorited] = React.useState(false);
  const [extra, setExtra] = React.useState<GenerationDTO[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const { data, isPending } = useGenerations({
    mode: mode === 'all' ? '' : mode,
    modelId: modelId === 'all' ? '' : modelId,
    favorited,
  });

  // 筛选条件变了就丢掉翻页累积的内容
  React.useEffect(() => {
    setExtra([]);
    setCursor(data?.nextCursor ?? null);
  }, [data]);

  const items = [...(data?.items ?? []), ...extra];

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ cursor, limit: '24' });
      if (mode !== 'all') qs.set('mode', mode);
      if (modelId !== 'all') qs.set('modelId', modelId);
      if (favorited) qs.set('favorited', '1');
      const page = await apiFetch<{ items: GenerationDTO[]; nextCursor: string | null }>(
        `/api/generations?${qs}`,
      );
      setExtra((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={mode}
          onValueChange={setMode}
          className="w-full sm:w-auto"
          items={[
            { value: 'all' as const, label: t('filterAll') },
            ...GENERATION_MODES.map((m) => ({ value: m, label: tm(m) })),
          ]}
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={favorited ? 'default' : 'outline'}
            onClick={() => setFavorited((v) => !v)}
          >
            <Heart className={cn('size-3.5', favorited && 'fill-current')} />
            {t('filterFavorited')}
          </Button>

          <Select
            value={modelId}
            onChange={setModelId}
            className="w-44"
            aria-label={t('filterModel')}
            options={[
              { value: 'all', label: t('filterAllModels') },
              ...(models ?? []).map((m) => ({
                value: m.id,
                label: pickI18n(m.displayName, locale),
              })),
            ]}
          />
        </div>
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((g) => (
              <GenerationCard key={g.id} generation={g} />
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
