'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Palette, Search, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useStyles } from '@/lib/hooks/use-catalog';
import { pickI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { StyleItem } from '@/types/generator';

const CATEGORIES = [
  'all',
  'ANIME',
  'REALISTIC',
  'THREE_D',
  'ILLUSTRATION',
  'OIL_PAINTING',
  'CYBERPUNK',
  'CHINESE_WASH',
  'WATERCOLOR',
  'PIXEL_ART',
  'PHOTOGRAPHY',
  'CONCEPT_ART',
  'LINE_ART',
  'CLAYMATION',
  'LOWPOLY',
  'POSTER',
  'OTHER',
] as const;

/** 缩略图缺失时的兜底：由 slug 派生的稳定渐变色块，不是灰色占位 */
function fallbackHue(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return h;
}

export function StyleCard({
  style,
  active,
  onClick,
}: {
  style: StyleItem;
  active: boolean;
  onClick: () => void;
}) {
  const locale = useLocale();
  const [loaded, setLoaded] = React.useState(false);
  const hue = fallbackHue(style.slug);
  // storageKey 形如 public/styles/x.webp，Next 把 public/ 挂在根路径
  const src = style.thumbnailUrl;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-xl border text-left transition-all',
        active
          ? 'border-primary ring-2 ring-primary/40'
          : 'border-border/70 hover:border-primary/40',
      )}
    >
      <span
        className="block aspect-[4/3] w-full"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 60% 22%), hsl(${(hue + 55) % 360} 65% 34%))`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          // 文件不存在时保持渐变底，不显示碎图图标
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      </span>

      <span className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {pickI18n(style.nameI18n, locale)}
        </span>
        {active && <Check className="size-3.5 shrink-0 text-primary" />}
      </span>
    </button>
  );
}

export function StylePicker({
  value,
  valueName,
  onChange,
}: {
  value: string | null;
  valueName: string | null;
  onChange: (preset: { id: string; name: string } | null) => void;
}) {
  const t = useTranslations('generator.style');
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<string>('all');
  const [rawQ, setRawQ] = React.useState('');
  const [mine, setMine] = React.useState(false);
  const q = useDebounce(rawQ, 300);

  const { data, isLoading } = useStyles({ category, q, mine, enabled: open });
  const styles = data?.items ?? [];

  return (
    <>
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('label')}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
            'border border-input bg-secondary/40 hover:border-primary/40',
          )}
        >
          <Palette className="size-4 shrink-0 text-primary" />
          <span className={cn('min-w-0 flex-1 truncate text-left', !valueName && 'text-muted-foreground')}>
            {valueName ?? t('none')}
          </span>
          {valueName && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t('clear')}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onChange(null);
                }
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
        </button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('title')}
        description={t('subtitle')}
        className="w-[min(94vw,56rem)]"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={rawQ}
                onChange={(e) => setRawQ(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="pl-8"
              />
            </div>
            <Button
              variant={mine ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMine((v) => !v)}
            >
              {t('mine')}
            </Button>
          </div>

          <Tabs
            value={category}
            onValueChange={setCategory}
            items={CATEGORIES.map((c) => ({
              value: c,
              label: c === 'all' ? t('all') : t(`categories.${c}` as never),
            }))}
          />

          <div className="max-h-[52vh] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="aspect-[4/3]" />
                ))}
              </div>
            ) : styles.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {mine ? t('emptyMine') : t('empty')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {styles.map((s) => (
                  <StyleCard
                    key={s.id}
                    style={s}
                    active={s.id === value}
                    onClick={() => {
                      onChange({ id: s.id, name: pickI18n(s.nameI18n, locale) });
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
