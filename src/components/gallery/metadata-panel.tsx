'use client';

import { useLocale, useTranslations } from 'next-intl';
import { CopyButton } from '@/components/common/copy-button';
import { Badge } from '@/components/ui/badge';
import { pickI18n } from '@/lib/i18n';
import type { CatalogModel, GenerationDTO } from '@/types/generator';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

export function MetadataPanel({
  generation,
  models,
  styleName,
}: {
  generation: GenerationDTO;
  models: CatalogModel[];
  styleName?: string | null;
}) {
  const t = useTranslations('generator.metadata');
  const tm = useTranslations('generator.modes');
  const locale = useLocale();

  const model = models.find((m) => m.id === generation.modelId);

  return (
    <div className="divide-y divide-border/60">
      <Row label={t('prompt')}>
        <span className="block max-w-72 break-words text-left text-xs leading-relaxed">
          {generation.prompt}
        </span>
      </Row>

      {generation.negativePrompt && (
        <Row label={t('negativePrompt')}>
          <span className="block max-w-72 break-words text-left text-xs leading-relaxed text-muted-foreground">
            {generation.negativePrompt}
          </span>
        </Row>
      )}

      <Row label={t('model')}>
        {model ? pickI18n(model.displayName, locale) : generation.modelId}
      </Row>

      <Row label={t('mode')}>{tm(generation.mode)}</Row>

      {styleName && <Row label={t('style')}>{styleName}</Row>}

      <Row label={t('params')}>
        <span className="flex flex-wrap justify-end gap-1">
          <Badge variant="muted">{generation.aspectRatio}</Badge>
          <Badge variant="muted">{generation.resolution}</Badge>
          <Badge variant="muted">
            {t('batch', { n: generation.batchCount })}
          </Badge>
          {generation.guidance !== null && (
            <Badge variant="muted">CFG {generation.guidance}</Badge>
          )}
          {generation.strength !== null && (
            <Badge variant="muted">strength {generation.strength}</Badge>
          )}
        </span>
      </Row>

      <Row label={t('seed')}>
        <span className="inline-flex items-center gap-1 font-mono text-xs">
          {generation.seed ?? '—'}
          {generation.seed && <CopyButton value={generation.seed} />}
        </span>
      </Row>

      <Row label={t('credits')}>
        <span className="tabular-nums">
          {t('creditsValue', {
            spent: generation.creditsSpent,
            refunded: generation.creditsRefunded,
          })}
        </span>
      </Row>

      {generation.durationMs !== null && (
        <Row label={t('duration')}>
          {(generation.durationMs / 1000).toFixed(1)}s
        </Row>
      )}

      <Row label={t('createdAt')}>
        {new Date(generation.createdAt).toLocaleString(locale)}
      </Row>
    </div>
  );
}
