'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { StyleCard } from '@/components/generator/style-picker';
import { useStyles } from '@/lib/hooks/use-catalog';
import { useGeneratorDraft } from '@/lib/generator-store';
import { pickI18n } from '@/lib/i18n';

/** 「我的风格」列表。取数走 /api/styles?mine=1，与生成器里的风格画廊同一份数据。 */
export function MyStyles() {
  const t = useTranslations('account.styles');
  const locale = useLocale();
  const router = useRouter();
  const patch = useGeneratorDraft((s) => s.patch);
  const { data, isPending } = useStyles({ mine: true });
  const styles = data?.items ?? [];

  // 点一张就带着它去生成器：比「记住名字再去下拉框里翻」少一步
  const use = (id: string, name: string) => {
    patch({ stylePresetId: id, styleName: name });
    router.push('/generate');
  };

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/3]" />
        ))}
      </div>
    );
  }

  if (styles.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border/70">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('emptyHint')}</p>
          <Link
            href="/generate"
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t('emptyCta')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {styles.map((s) => (
        <StyleCard
          key={s.id}
          style={s}
          active={false}
          onClick={() => use(s.id, pickI18n(s.nameI18n, locale))}
        />
      ))}
    </div>
  );
}
