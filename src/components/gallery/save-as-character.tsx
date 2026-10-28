'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateCharacter } from '@/lib/hooks/use-characters';

/**
 * 「把这张生成结果设为形象」。
 *
 * 自包含：只管一个 imageId，服务端会复用它的 storageKey 建一行 Asset（不复制字节，
 * 见 /api/characters 的 assetFromImage），所以这里不需要先上传一次。
 *
 * 两个调用点的外观差异太大（图块上的深色悬浮图标条 / 大图里的描边按钮），
 * 所以触发按钮交给调用方给 className，`iconOnly` 只决定要不要带文字。
 */
export function SaveAsCharacter({
  imageId,
  className,
  iconOnly = false,
}: {
  imageId: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const t = useTranslations('characters');
  const tc = useTranslations('common');
  const create = useCreateCharacter();

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('nameRequired'));
      return;
    }
    try {
      await create.mutateAsync({ name: trimmed, description, imageId });
      setOpen(false);
      setName('');
      setDescription('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} title={t('saveAs')}>
        <UserPlus className="size-4" />
        {!iconOnly && t('saveAs')}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('saveAsTitle')}
        description={t('saveAsDesc')}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="save-as-character-name">{t('nameLabel')}</Label>
            <Input
              id="save-as-character-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder={t('namePlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('nameHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="save-as-character-desc">{t('descLabel')}</Label>
            <Textarea
              id="save-as-character-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              rows={3}
              placeholder={t('descPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('descHint')}</p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={create.isPending}>
              {tc('cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {t('create')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
