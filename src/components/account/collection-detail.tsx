'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Check, Images, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiClientError } from '@/lib/api-client';
import { useGenerations } from '@/lib/hooks/use-catalog';
import {
  useAddToCollection,
  useCollection,
  useDeleteCollection,
  useRemoveFromCollection,
  useUpdateCollection,
} from '@/lib/hooks/use-collections';
import { cn } from '@/lib/utils';

export function CollectionDetail({ id }: { id: string }) {
  const t = useTranslations('account.collections');
  const router = useRouter();

  const { data, isPending } = useCollection(id);
  const { data: history } = useGenerations({});
  const update = useUpdateCollection(id);
  const removeImages = useRemoveFromCollection(id);
  const addImages = useAddToCollection(id);
  const del = useDeleteCollection(id);

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameName, setRenameName] = React.useState('');
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  const collection = data?.collection;
  const items = data?.items ?? [];

  // 已在集合里的就不列了。只筛出前 48 张（详情页那一页）——
  // 更靠后的即使漏进来，服务端的 skipDuplicates 也会吃掉。
  const candidates = React.useMemo(() => {
    const taken = new Set(items.map((i) => i.id));
    return (history?.items ?? [])
      .flatMap((g) => g.images)
      .filter(
        (img) => img.status === 'SUCCEEDED' && img.thumbUrl && !taken.has(img.id),
      );
  }, [history, items]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('failed'));
      return null;
    }
  };

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border/70">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{t('notFound')}</p>
          <Link
            href="/account/collections"
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t('back')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href="/account/collections"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t('back')}
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{collection.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('count', { count: collection.itemCount })}
            {collection.description && (
              <>
                <span className="mx-1.5">·</span>
                {collection.description}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setAddOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            {t('addImages')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setRenameName(collection.name);
              setRenameOpen(true);
            }}
          >
            <Pencil className="size-3.5" />
            {t('rename')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-3.5" />
            {t('delete')}
          </Button>
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border/70">
          <div className="text-center">
            <Images className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{t('empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('emptyHint')}</p>
            <Button
              className="mt-4"
              onClick={() => {
                setError(null);
                setAddOpen(true);
              }}
            >
              <Plus />
              {t('addImages')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-secondary/40"
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
              <button
                type="button"
                title={t('remove')}
                aria-label={t('remove')}
                disabled={removeImages.isPending}
                onClick={() => void run(() => removeImages.mutateAsync([img.id]))}
                className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── 重命名 ── */}
      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title={t('renameTitle')}
      >
        <div className="space-y-4">
          <Input
            value={renameName}
            maxLength={40}
            autoFocus
            aria-label={t('nameLabel')}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameName.trim()) {
                void run(async () => {
                  await update.mutateAsync({ name: renameName.trim() });
                  setRenameOpen(false);
                });
              }
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={!renameName.trim() || update.isPending}
              onClick={() =>
                void run(async () => {
                  await update.mutateAsync({ name: renameName.trim() });
                  setRenameOpen(false);
                })
              }
            >
              {update.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── 删除确认 ── */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('deleteTitle')}
        description={t('deleteDesc')}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={() =>
              void run(async () => {
                await del.mutateAsync(undefined);
                // 集合没了，留在详情页只会看到 404
                router.push('/account/collections');
              })
            }
          >
            {del.isPending ? t('deleting') : t('deleteConfirm')}
          </Button>
        </div>
      </Dialog>

      {/* ── 添加图片 ── */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('addTitle')}
        description={t('addDesc')}
        className="w-[min(92vw,52rem)]"
      >
        {candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('addNone')}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
              {candidates.map((img) => {
                const on = picked.has(img.id);
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (on) next.delete(img.id);
                        else next.add(img.id);
                        return next;
                      })
                    }
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-lg border-2 bg-secondary/40 transition-colors',
                      on ? 'border-primary' : 'border-transparent hover:border-border',
                    )}
                  >
                    {img.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img.thumbUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                    {on && (
                      <span className="absolute inset-0 grid place-items-center bg-primary/30">
                        <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3.5" />
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-xs text-muted-foreground">
                {t('picked', { count: picked.size })}
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  setPicked(new Set());
                  setAddOpen(false);
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                disabled={picked.size === 0 || addImages.isPending}
                onClick={() =>
                  void run(async () => {
                    await addImages.mutateAsync([...picked]);
                    setPicked(new Set());
                    setAddOpen(false);
                  })
                }
              >
                {addImages.isPending && <Loader2 className="animate-spin" />}
                {t('addSelected', { count: picked.size })}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
