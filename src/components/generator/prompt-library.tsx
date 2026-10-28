'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BookOpen, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePrompts } from '@/lib/hooks/use-catalog';
import { pickI18n } from '@/lib/i18n';
import type { PromptItem } from '@/types/generator';

/** 分类是 seed 里的受控词表，逐条本地化；认不出的原样回显，好过显示一个键名 */
const CATEGORIES = [
  'portrait',
  'landscape',
  'illustration',
  'anime',
  'product',
  'food',
  'poster',
  'interior',
  'concept',
  'chinese',
  'abstract',
  'fashion',
] as const;

/**
 * 精选提示词库。分类与搜索都在服务端做，但分类标签直接由取回的第一页推导 ——
 * 因为 usePrompts 固定 limit=60，而精选库现在 50 条，一页装得下，
 * 为此再加一个「列出全部分类」的接口不值得。
 * ★ 但这也意味着**库里超过 60 条就会有条目静默消失**，加词条时留意。
 */
export function PromptLibrary({
  onApply,
}: {
  onApply: (p: { prompt: string; negativePrompt: string | null }) => void;
}) {
  const t = useTranslations('generator.library');
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState('all');
  const [rawQ, setRawQ] = React.useState('');
  const q = useDebounce(rawQ, 300);

  const { data, isLoading } = usePrompts({ category: 'all', q, enabled: open });
  const all = data?.items ?? [];

  // 按分类过滤在客户端做：搜索命中的结果同样会参与分类筛选，两个条件天然叠加
  const categories = React.useMemo(
    () => CATEGORIES.filter((c) => all.some((p) => p.category === c)),
    [all],
  );
  const items = category === 'all' ? all : all.filter((p) => p.category === category);

  const apply = (p: PromptItem) => {
    onApply({ prompt: p.prompt, negativePrompt: p.negativePrompt });
    setOpen(false);
  };

  return (
    <>
      <Button size="sm" variant="ghost" title={t('hint')} onClick={() => setOpen(true)}>
        <BookOpen />
        {t('open')}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('title')}
        description={t('subtitle')}
        className="w-[min(94vw,44rem)]"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={rawQ}
              onChange={(e) => setRawQ(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-8"
            />
          </div>

          {categories.length > 0 && (
            <Tabs
              value={category}
              onValueChange={setCategory}
              variant="line"
              items={[
                { value: 'all', label: t('all') },
                ...categories.map((c) => ({ value: c, label: t(`categories.${c}` as never) })),
              ]}
            />
          )}

          <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
            {isLoading ? (
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20" />)
            ) : items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
              items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => apply(p)}
                  className="w-full rounded-xl border border-border/70 bg-card/40 p-3 text-left transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {pickI18n(p.titleI18n, locale)}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {t('apply')}
                    </span>
                  </div>
                  {/* 提示词正文不翻译 —— 它就是用户要拿去用的那句 */}
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.prompt}</p>
                  {p.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.tags.map((tag) => (
                        <span key={tag} className="text-[11px] text-muted-foreground/70">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
