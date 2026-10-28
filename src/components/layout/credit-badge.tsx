'use client';

import { useTranslations } from 'next-intl';
import { Coins } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Tooltip } from '@/components/ui/tooltip';
import { useMe } from '@/lib/hooks/use-catalog';
import { cn } from '@/lib/utils';

/** 顶栏余额。生成提交后由生成器 invalidate ['me'] 触发刷新，因此是实时的。 */
export function CreditBadge() {
  const t = useTranslations('account');
  const { data: me, isPending } = useMe();

  // 未登录时接口返回 401，这里静默不渲染 —— 由 UserMenu 去显示登录入口
  if (isPending || !me) return null;

  return (
    <Tooltip content={t('balance')}>
      <Link
        href="/account"
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-border/70 bg-secondary/40 px-2.5 py-1.5',
          'text-sm tabular-nums transition-colors hover:border-primary/40',
        )}
      >
        <Coins className="size-3.5 text-primary" />
        {me.creditBalance}
      </Link>
    </Tooltip>
  );
}
