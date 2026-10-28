'use client';

import { useTranslations } from 'next-intl';
import { Coins, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CostEstimate({
  perImage,
  batch,
  balance,
}: {
  perImage: number;
  batch: number;
  balance: number | undefined;
}) {
  const t = useTranslations('generator.cost');
  const total = perImage * batch;
  const short = balance !== undefined && total > balance;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Coins className="size-3.5" />
          {t('perImage', { n: perImage })}
        </span>
        <span className={cn('font-medium tabular-nums', short && 'text-destructive')}>
          {t('total', { n: total })}
        </span>
      </div>

      {short && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3" />
          {t('insufficient', { balance: balance ?? 0, short: total - (balance ?? 0) })}
        </p>
      )}
    </div>
  );
}
