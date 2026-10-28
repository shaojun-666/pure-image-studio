'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Download, Wand2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MetadataPanel } from '@/components/gallery/metadata-panel';
import { Link, useRouter } from '@/i18n/navigation';
import { useGeneration, useModels } from '@/lib/hooks/use-catalog';
import { draftFromGeneration, useGeneratorDraft } from '@/lib/generator-store';
import { resolveDimensions } from '@/lib/ai/aspect';
import type { AspectRatio, Resolution } from '@/lib/ai/contracts';

/** 详情页：全部元数据 + 复制种子 + 一键同款 */
export function HistoryDetail({ id }: { id: string }) {
  const t = useTranslations('history');
  const tg = useTranslations('generator');
  const tc = useTranslations('common');
  const router = useRouter();
  const patch = useGeneratorDraft((s) => s.patch);

  const { data: g, isPending, error } = useGeneration(id);
  const { data: models } = useModels();

  if (isPending) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !g) {
    return (
      <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border/70">
        <div className="text-center">
          <AlertCircle className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{t('notFound')}</p>
          <Link href="/history" className="mt-4 inline-block text-sm text-primary underline">
            {t('backToList')}
          </Link>
        </div>
      </div>
    );
  }

  const { width, height } = resolveDimensions(
    g.aspectRatio as AspectRatio,
    g.resolution as Resolution,
  );
  const succeeded = g.images.filter((i) => i.status === 'SUCCEEDED');

  const remix = () => {
    patch(draftFromGeneration(g));
    router.push('/generate');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/history" className="text-sm text-muted-foreground hover:text-foreground">
            ← {t('title')}
          </Link>
          <Badge variant="muted" className="ml-auto">
            {t(`status.${g.status}` as never)}
          </Badge>
          {g.durationMs !== null && (
            <Badge variant="outline">{(g.durationMs / 1000).toFixed(1)}s</Badge>
          )}
        </div>

        {succeeded.length === 0 ? (
          <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border/70 p-8 text-center">
            <div>
              <p className="text-sm text-muted-foreground">
                {t(`status.${g.status}` as never)}
              </p>
              {g.errorMessage && (
                <p className="mt-2 text-xs text-destructive">{g.errorMessage}</p>
              )}
            </div>
          </div>
        ) : (
          <div
            className={
              succeeded.length > 1
                ? 'grid grid-cols-2 gap-3'
                : 'grid grid-cols-1 gap-3'
            }
          >
            {succeeded.map((img) => (
              <div
                key={img.id}
                style={{ aspectRatio: width / height }}
                className="group relative overflow-hidden rounded-xl border border-border/60 bg-secondary/40"
              >
                {img.placeholder && (
                  <img
                    src={img.placeholder}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
                  />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url ?? ''}
                  alt=""
                  className="relative h-full w-full object-cover"
                />
                <a
                  href={`/api/images/${img.id}/download`}
                  title={tc('save')}
                  className="absolute bottom-2 right-2 rounded-lg bg-black/60 p-2 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Download className="size-4" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-border/70 p-4">
          <MetadataPanel generation={g} models={models ?? []} />
        </div>

        <Button className="w-full" size="lg" onClick={remix}>
          <Wand2 />
          {tg('actions.remix')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t('remixHint')}</p>
      </aside>
    </div>
  );
}
