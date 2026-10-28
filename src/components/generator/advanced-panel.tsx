'use client';

import { useTranslations } from 'next-intl';
import { Lock, Unlock, Dices, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { GenerationMode, ModelCapabilities } from '@/lib/ai/contracts';

/** 只在有可用控件时才展开，否则整块隐藏 —— 不做「空的折叠面板」 */
export function AdvancedPanel({
  cap,
  mode,
  seed,
  seedLocked,
  guidance,
  strength,
  onChange,
}: {
  cap: ModelCapabilities;
  mode: GenerationMode;
  seed: string | null;
  seedLocked: boolean;
  guidance: number;
  strength: number;
  onChange: (p: {
    seed?: string | null;
    seedLocked?: boolean;
    guidance?: number;
    strength?: number;
  }) => void;
}) {
  const t = useTranslations('generator.advanced');
  const [open, setOpen] = React.useState(false);

  const showStrength = cap.supportsStrength && mode === 'imageToImage';
  const hasAny = cap.supportsSeed || cap.supportsGuidance || showStrength;
  if (!hasAny) return null;

  const randomSeed = () =>
    onChange({ seed: String(Math.floor(Math.random() * 2 ** 31)), seedLocked: true });

  return (
    <div className="rounded-xl border border-border/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {t('title')}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/70 px-3 py-3">
          {cap.supportsSeed && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{t('seed')}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={randomSeed}>
                    <Dices />
                    {t('seedRandom')}
                  </Button>
                  <span title={seedLocked ? t('unlock') : t('lock')}>
                    <Switch
                      checked={seedLocked}
                      onCheckedChange={(v) =>
                        // 打开锁定时如果还没有种子，先替他摇一个
                        onChange(v && !seed ? { seedLocked: true, seed: String(Math.floor(Math.random() * 2 ** 31)) } : { seedLocked: v })
                      }
                      aria-label={t('lock')}
                    />
                  </span>
                </div>
              </div>

              <div className="relative">
                <Input
                  value={seed ?? ''}
                  inputMode="numeric"
                  onChange={(e) =>
                    onChange({ seed: e.target.value.replace(/\D/g, '') || null })
                  }
                  placeholder={t('seedPlaceholder')}
                  disabled={!seedLocked}
                  className="pr-8 font-mono text-xs"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {seedLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t('seedHint')}</p>
            </div>
          )}

          {cap.supportsGuidance && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">{t('guidance')}</span>
                <span className="tabular-nums text-foreground">{guidance.toFixed(1)}</span>
              </div>
              <Slider
                min={1}
                max={20}
                step={0.5}
                value={guidance}
                onValueChange={(v) => onChange({ guidance: v })}
                aria-label={t('guidance')}
              />
              <p className="text-xs text-muted-foreground">{t('guidanceHint')}</p>
            </div>
          )}

          {showStrength && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">{t('strength')}</span>
                <span className="tabular-nums text-foreground">{strength.toFixed(2)}</span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={strength}
                onValueChange={(v) => onChange({ strength: v })}
                aria-label={t('strength')}
              />
              <p className="text-xs text-muted-foreground">{t('strengthHint')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
