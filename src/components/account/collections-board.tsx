'use client';

import * as React from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Images, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { ApiClientError } from '@/lib/api-client';
import { useCollections, useCreateCollection } from '@/lib/hooks/use-collections';

/** 集合卡片墙。新建也走这里——「＋」本身就是网格里的最后一格，不需要单独的按钮。 */
export function CollectionsBoard() {
  const t = useTranslations('account.collections');
  const format = useFormatter();
  const { data, isPending } = useCollections();
  const create = useCreateCollection();

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const collections = data?.items ?? [];

  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim() });
      setName('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('failed'));
    }
  };

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/3]" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {collections.map((c) => (
          <Link
            key={c.id}
            href={`/account/collections/${c.id}`}
            className="group overflow-hidden rounded-2xl border border-border/70 transition-colors hover:border-primary/40"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-secondary/40">
              {c.coverPlaceholder && (
                <img
                  src={c.coverPlaceholder}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
                />
              )}
              {c.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.coverUrl}
                  alt=""
                  loading="lazy"
                  className="relative h-full w-full object-cover"
                />
              ) : (
                <span className="relative grid h-full place-items-center">
                  <Images className="size-6 text-muted-foreground" />
                </span>
              )}
            </div>
            <div className="space-y-0.5 px-3 py-2.5">
              <p className="line-clamp-1 text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {t('count', { count: c.itemCount })}
                <span className="mx-1.5">·</span>
                {format.dateTime(new Date(c.updatedAt), {
                  month: 'numeric',
                  day: 'numeric',
                })}
              </p>
            </div>
          </Link>
        ))}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid aspect-[4/3] place-items-center rounded-2xl border border-dashed border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <span className="text-center">
            <Plus className="mx-auto size-6" />
            <span className="mt-2 block text-sm">{t('new')}</span>
          </span>
        </button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('newTitle')}
        description={t('newDesc')}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="collection-name" className="text-sm font-medium">
              {t('nameLabel')}
            </label>
            <Input
              id="collection-name"
              value={name}
              maxLength={40}
              autoFocus
              placeholder={t('namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) void submit();
              }}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending ? t('creating') : t('create')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
