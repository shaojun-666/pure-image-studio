'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';

/**
 * [locale] 段的错误边界：所有页面（生成器、探索、后台…）抛错都落到这里。
 *
 * ★ 从前整个项目一个 error.tsx 都没有，于是任何一处抛错都由 Next 兜底 ——
 *   线上看到的是**英文的**「Application error: a client-side exception has occurred」，
 *   既没有品牌、也没有可点的出口。这个文件补的就是那一格。
 *
 * 位置说明：它渲染在 [locale]/layout.tsx 之内，所以自带页头页脚，
 * 也能用 next-intl。而 [locale]/layout.tsx **自己**抛错时轮不到它
 * （同一段的 error.tsx 管不到本段 layout），那种情况由 app/global-error.tsx 兜。
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  // 开发时 message 有用，生产会被 Next 抹成空串；digest 是两边都有的关联码
  React.useEffect(() => {
    console.error('[locale error boundary]', error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16">
      <div className="enter-up w-full max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-destructive/30 bg-destructive/10">
          <TriangleAlert className="size-5 text-destructive" />
        </div>

        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          {t('errorTitle')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('errorHint')}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw />
            {t('retry')}
          </Button>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            {t('backHome')}
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 font-mono text-[11px] text-muted-foreground/60">
            {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
