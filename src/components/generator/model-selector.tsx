'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Zap, Gem, Crown, Coins } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { pickI18n } from '@/lib/i18n';
import { perImageCost } from '@/lib/ai/pricing';
import type { CatalogModel } from '@/types/generator';
import { GENERATION_MODES, type GenerationMode, type ModelTier } from '@/lib/ai/contracts';

const TIER_ICON: Record<ModelTier, typeof Zap> = {
  FAST: Zap,
  QUALITY: Gem,
  ULTRA: Crown,
};

/**
 * 模型下拉框。所有文案都来自接口返回的 descriptor，
 * 代码里不出现任何具体模型名 —— 这是「加模型零改前端」的前半段。
 */
export function ModelSelector({
  models,
  value,
  mode,
  onChange,
  disabled,
}: {
  models: CatalogModel[];
  value: string | null;
  mode: GenerationMode;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('generator.model');
  const locale = useLocale();

  if (!models.length) return null;

  const options = models.map((m) => {
    const Icon = TIER_ICON[m.tier] ?? Zap;
    /**
     * ★ 这里**不再**按当前模式置灰。
     *
     * 原来写的是 `disabled: !m.capabilities.modes[mode]`，而 mode-tabs 那边是
     * 「模式按当前模型的能力置灰」—— 两个控件互相拿对方当门控，配成了死锁：
     *   想选只支持图生图的模型 → 得先切到图生图 → 图生图要等选中那个模型才亮。
     * 结果 qwen-image-edit 永远点不到，图生图这个能力在 UI 上等于不存在。
     *
     * 现在允许选任意模型，由 generator-shell 在选中时把模式一并切到该模型支持的那个。
     */
    const effMode =
      (m.capabilities.modes[mode]
        ? mode
        : GENERATION_MODES.find((x) => m.capabilities.modes[x])) ?? mode;
    // 价格按「切过去之后会执行的模式」算，否则会显示一个它根本不会跑的模式的价
    const cost = perImageCost(m, effMode);
    const badge = m.badge ? pickI18n(m.badge, locale) : '';

    return {
      value: m.id,
      // 不隐藏也不置灰：直接消失会让用户以为「这个模型没了」
      label: (
        <span className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-primary" />
          <span className="truncate font-medium">{pickI18n(m.displayName, locale)}</span>
          {badge && <Badge variant="muted">{badge}</Badge>}
          <span className="ml-auto flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
            <Coins className="size-3" />
            {cost}
          </span>
        </span>
      ),
      hint: m.description ? pickI18n(m.description, locale) : undefined,
    };
  });

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{t('label')}</span>
      <Select
        value={value ?? ''}
        options={options}
        onChange={onChange}
        disabled={disabled}
        placeholder={t('placeholder')}
        aria-label={t('label')}
      />
    </div>
  );
}
