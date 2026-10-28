'use client';

import { useTranslations } from 'next-intl';
import { Sparkles, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

/**
 * 按钮为什么不能点，必须说清楚。
 * 「灰着一个按钮不给理由」是这类工具最常见的体验缺陷。
 */
export function GenerateButton({
  cost,
  balance,
  promptLength,
  maxChars,
  hasRequiredImage,
  pending,
  running,
  onSubmit,
  onCancel,
}: {
  cost: number;
  balance: number | undefined;
  promptLength: number;
  maxChars: number;
  hasRequiredImage: boolean;
  pending: boolean;
  running: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('generator.actions');

  const reason = !hasRequiredImage
    ? t('needImage')
    : promptLength === 0
      ? t('needPrompt')
      : promptLength > maxChars
        ? t('tooLong', { max: maxChars })
        : balance !== undefined && cost > balance
          ? t('needCredits')
          : null;

  if (running) {
    return (
      <Button variant="outline" size="lg" className="w-full" onClick={onCancel}>
        <Square />
        {t('cancel')}
      </Button>
    );
  }

  const button = (
    <Button
      size="lg"
      className="w-full"
      disabled={Boolean(reason) || pending}
      onClick={onSubmit}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {pending ? t('submitting') : t('generate')}
    </Button>
  );

  return reason ? <Tooltip content={reason} className="w-full">{button}</Tooltip> : button;
}
