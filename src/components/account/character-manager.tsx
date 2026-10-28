'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { uploadAsset } from '@/lib/upload';
import { useGenerations } from '@/lib/hooks/use-catalog';
import {
  useCharacters,
  useCreateCharacter,
  useDeleteCharacter,
  useUpdateCharacter,
} from '@/lib/hooks/use-characters';
import { cn } from '@/lib/utils';
import type { CharacterItem } from '@/types/generator';

/**
 * 新建时可选的图源。编辑时不给选 —— PATCH 不收图，换图请删了重建。
 *
 * 'text' = 文字形象：不传参考图，只靠外形描述注入，任何模型都能用。
 * 另两种都是图片形象，只有在实测支持 subject 参考图的模型上才会真把图带过去。
 */
type Source = 'text' | 'upload' | 'history';

export function CharacterManager() {
  const t = useTranslations('account.characters');
  const tc = useTranslations('common');

  const { data, isPending } = useCharacters();
  const characters = data?.items ?? [];
  const create = useCreateCharacter();
  const update = useUpdateCharacter();
  const remove = useDeleteCharacter();

  const [open, setOpen] = React.useState(false);
  /** 有值 = 编辑这个形象；null = 新建 */
  const [editing, setEditing] = React.useState<CharacterItem | null>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [source, setSource] = React.useState<Source>('upload');
  /** 上传得到的素材（新建用） */
  const [uploaded, setUploaded] = React.useState<{ id: string; url: string } | null>(null);
  /** 从历史生成里挑的图（新建用） */
  const [pickedImageId, setPickedImageId] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [deleting, setDeleting] = React.useState<CharacterItem | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // 历史图只在真的需要挑的时候才拉（新建 + 切到那个来源），避免每次进页面都查一遍
  const history = useGenerations({});
  const historyImages = React.useMemo(() => {
    if (!open || editing || source !== 'history') return [];
    return (history.data?.items ?? [])
      .flatMap((g) => g.images)
      .filter((img) => img.status === 'SUCCEEDED' && img.thumbUrl)
      .slice(0, 24);
  }, [open, editing, source, history.data]);

  const busy = create.isPending || update.isPending;

  const reset = () => {
    setName('');
    setDescription('');
    setSource('upload');
    setUploaded(null);
    setPickedImageId(null);
    setError(null);
  };

  const openCreate = () => {
    reset();
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (c: CharacterItem) => {
    reset();
    setEditing(c);
    setName(c.name);
    setDescription(c.description);
    setOpen(true);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const a = await uploadAsset(file, 'SUBJECT_REF');
      setUploaded({ id: a.assetId, url: a.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('nameRequired'));
      return;
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, name: trimmed, description });
      } else if (source === 'text') {
        // 文字形象：不传任何图源，所以服务端要求描述非空，否则它什么也注入不了
        if (!description.trim()) {
          setError(t('descRequiredForText'));
          return;
        }
        await create.mutateAsync({ name: trimmed, description });
      } else if (source === 'upload') {
        if (!uploaded) {
          setError(t('imageRequired'));
          return;
        }
        await create.mutateAsync({
          name: trimmed,
          description,
          assetId: uploaded.id,
        });
      } else {
        if (!pickedImageId) {
          setError(t('imageRequired'));
          return;
        }
        await create.mutateAsync({
          name: trimmed,
          description,
          imageId: pickedImageId,
        });
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
    } finally {
      setDeleting(null);
    }
  };

  const preview = editing?.url ?? uploaded?.url ?? null;

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t('count', { n: characters.length })}</p>
        <Button size="sm" onClick={openCreate}>
          <Plus />
          {t('new')}
        </Button>
      </div>

      {characters.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border/70">
          <div className="max-w-sm text-center">
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('emptyHint')}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {characters.map((c) => (
            <div
              key={c.id}
              className="group overflow-hidden rounded-xl border border-border/70 bg-secondary/20"
            >
              {c.url ? (
                <div
                  className="checkerboard relative w-full overflow-hidden"
                  style={{ aspectRatio: `${c.width || 1} / ${c.height || 1}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt="" className="h-full w-full object-cover" />
                </div>
              ) : (
                // 文字形象：没有参考图，用首字占位而不是渲染破图
                <div className="grid aspect-square w-full place-items-center bg-muted text-2xl text-muted-foreground">
                  {c.name.slice(0, 1)}
                </div>
              )}
              <div className="space-y-1 p-2.5">
                <p className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
                    {t(c.assetId ? 'kindImage' : 'kindText')}
                  </span>
                </p>
                <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
                  {c.description || t('noDescription')}
                </p>
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil />
                    {t('edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(c)}
                  >
                    <Trash2 />
                    {t('delete')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 新建 / 编辑 ── */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('editTitle') : t('newTitle')}
        description={editing ? t('editDesc') : t('newDesc')}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="character-name">{t('nameLabel')}</Label>
            <Input
              id="character-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder={t('namePlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('nameHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="character-desc">{t('descLabel')}</Label>
            <Textarea
              id="character-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              rows={3}
              placeholder={t('descPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('descHint')}</p>
          </div>

          {/* 编辑时不给换图：PATCH 只收名字和描述 */}
          <div className="space-y-2">
            <Label>{editing ? t('imageLabel') : t('kindLabel')}</Label>

            {/* 编辑态只展示现状。文字形象没有图，得说一句，否则这里是一片空白 */}
            {editing ? (
              editing.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editing.url}
                  alt=""
                  className="h-40 w-40 rounded-lg border border-border object-cover"
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('sourceTextHint')}
                </p>
              )
            ) : preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt=""
                className="h-40 w-40 rounded-lg border border-border object-cover"
              />
            ) : null}

            {!editing && (
              <>
                <div className="flex flex-wrap gap-1">
                  {(['text', 'upload', 'history'] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={source === s ? 'secondary' : 'ghost'}
                      onClick={() => {
                        setSource(s);
                        setError(null);
                      }}
                    >
                      {t(
                        s === 'text'
                          ? 'sourceText'
                          : s === 'upload'
                            ? 'sourceUpload'
                            : 'sourceHistory',
                      )}
                    </Button>
                  ))}
                </div>

                {source === 'text' ? (
                  // 文字形象不需要图源，说明白它靠什么生效，免得用户以为漏了一步
                  <p className="text-xs text-muted-foreground">
                    {t('sourceTextHint')}
                  </p>
                ) : source === 'upload' ? (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/50">
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    {t('uploadCta')}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        void pickFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                ) : historyImages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {history.isPending ? t('loading') : t('historyEmpty')}
                  </p>
                ) : (
                  <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-5">
                    {historyImages.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setPickedImageId(img.id)}
                        className={cn(
                          'overflow-hidden rounded-md border-2 transition-colors',
                          pickedImageId === img.id
                            ? 'border-primary'
                            : 'border-transparent hover:border-border',
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.thumbUrl!}
                          alt=""
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tc('cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={busy || uploading}>
              {busy && <Loader2 className="animate-spin" />}
              {editing ? t('save') : t('create')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t('deleteTitle')}
        description={t('deleteDesc')}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            {tc('cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => void confirmDelete()}
          >
            {remove.isPending && <Loader2 className="animate-spin" />}
            {t('deleteConfirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
