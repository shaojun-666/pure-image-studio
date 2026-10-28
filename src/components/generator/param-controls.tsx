'use client';

import { useTranslations } from 'next-intl';
import { Tabs } from '@/components/ui/tabs';
import { resolveDimensions } from '@/lib/ai/aspect';
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  isSerialBatch,
  userBatchLimit,
} from '@/lib/ai/contracts';
import type { AspectRatio, ModelCapabilities, Resolution } from '@/lib/ai/contracts';

/** 三组参数控件都按 capabilities 过滤：模型不支持的档位置灰而不是消失 */

export function AspectRatioPills({
  cap,
  value,
  resolution,
  onChange,
}: {
  cap: ModelCapabilities;
  value: AspectRatio;
  resolution: Resolution;
  onChange: (v: AspectRatio) => void;
}) {
  const t = useTranslations('generator.params');

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{t('aspect')}</span>
      <Tabs
        value={value}
        onValueChange={onChange}
        items={ASPECT_RATIOS.map((ar) => {
          const { width, height } = resolveDimensions(ar, resolution);
          return {
            value: ar,
            label: ar,
            disabled: !cap.supportedAspectRatios.includes(ar),
            hint: `${width} × ${height}`,
          };
        })}
      />
    </div>
  );
}

export function ResolutionPills({
  cap,
  value,
  onChange,
}: {
  cap: ModelCapabilities;
  value: Resolution;
  onChange: (v: Resolution) => void;
}) {
  const t = useTranslations('generator.params');

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{t('resolution')}</span>
      <Tabs
        value={value}
        onValueChange={onChange}
        items={RESOLUTIONS.map((r) => ({
          value: r,
          label: r,
          disabled: !cap.supportedResolutions.includes(r),
          hint: cap.supportedResolutions.includes(r) ? undefined : t('unsupported'),
        }))}
      />
    </div>
  );
}

export function BatchCountPills({
  cap,
  value,
  onChange,
}: {
  cap: ModelCapabilities;
  value: number;
  onChange: (v: number) => void;
}) {
  const t = useTranslations('generator.params');
  const max = userBatchLimit(cap);

  return (
    <div className="space-y-1.5">
      <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{t('batch')}</span>
        <span className="font-normal">
          {/* 单次只出 1 张的模型，选 8 张等于排队跑 8 轮 —— 得先说清楚，别让用户干等 */}
          {isSerialBatch(cap)
            ? t('batchSerial', { per: cap.maxBatch })
            : t('batchMax', { max })}
        </span>
      </span>
      <Tabs
        value={String(value)}
        onValueChange={(v) => onChange(Number(v))}
        items={Array.from({ length: 8 }, (_, i) => i + 1).map((n) => ({
          value: String(n),
          label: String(n),
          disabled: n > max,
          hint: n > max ? t('unsupported') : undefined,
        }))}
      />
    </div>
  );
}
