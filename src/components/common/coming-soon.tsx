'use client';

import { useTranslations } from 'next-intl';
import { Construction } from 'lucide-react';

/** 占位页：路由骨架先立住，具体实现按里程碑逐个替换。 */
export function ComingSoon({
  titleKey,
  ns = 'nav',
}: {
  titleKey: string;
  ns?: 'nav' | 'footer';
}) {
  const t = useTranslations(ns);
  const tc = useTranslations('common');

  return (
    <div className="container flex min-h-[62vh] flex-col items-center justify-center py-24 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border/60 bg-gradient-to-br from-primary/20 to-accent/10">
        <Construction className="h-6 w-6 text-primary" />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        {t(titleKey)}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">{tc('comingSoon')}</p>
    </div>
  );
}
