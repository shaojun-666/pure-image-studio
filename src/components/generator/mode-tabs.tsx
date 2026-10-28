'use client';

import { useTranslations } from 'next-intl';
import { Tabs } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { GENERATION_MODES, type GenerationMode } from '@/lib/ai/contracts';
import type { CatalogModel } from '@/types/generator';

/**
 * ★ 能力门控的唯一落点：模型不支持的模式在这里置灰。
 *   新增模型或调整 capabilities 时，这个文件一行都不用改。
 */
export function ModeTabs({
  model,
  value,
  onChange,
}: {
  model: CatalogModel | undefined;
  value: GenerationMode;
  onChange: (m: GenerationMode) => void;
}) {
  const t = useTranslations('generator.modes');
  const tHint = useTranslations('generator.modeHints');
  const tc = useTranslations('generator');

  const items = GENERATION_MODES.map((mode) => {
    const supported = model ? model.capabilities.modes[mode] : true;
    const label = t(mode);
    return {
      value: mode,
      label: supported ? label : <span className="line-through opacity-70">{label}</span>,
      disabled: !supported,
      hint: supported
        ? tHint(mode)
        : tc('modelUnsupported', { model: model?.displayName.zh ?? '' }),
    };
  });

  return (
    <Tabs
      value={value}
      onValueChange={onChange}
      items={items.map((i) => ({
        ...i,
        label: i.disabled ? (
          <Tooltip content={i.hint}>{i.label as React.ReactNode}</Tooltip>
        ) : (
          i.label
        ),
      }))}
      className="w-full"
    />
  );
}
