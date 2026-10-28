'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ImagePlus, RotateCcw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { CompareSlider } from '@/components/editor/compare-slider';
import { CostEstimate } from '@/components/generator/cost-estimate';
import { GenerateButton } from '@/components/generator/generate-button';
import { ModelSelector } from '@/components/generator/model-selector';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { perImageCost } from '@/lib/ai/pricing';
import { uploadAsset } from '@/lib/upload';
import { uuid } from '@/lib/uuid';
import { useMe, useModels } from '@/lib/hooks/use-catalog';
import { useCharacters } from '@/lib/hooks/use-characters';
import { useGenerationStream } from '@/lib/hooks/use-generation-stream';
import { characterIdsIn } from '@/lib/mention';
import { cn } from '@/lib/utils';
import type { AspectRatio, GenerationMode } from '@/lib/ai/contracts';
import type { CreateGenerationResult } from '@/types/generator';

export interface ToolAsset {
  id: string;
  url: string;
  width: number;
  height: number;
}

function ratioValue(r: string): number {
  const [a, b] = r.split(':').map(Number);
  return b ? a / b : 1;
}

/** 工具类的 aspectRatio 只是个占位参数：输出尺寸由源图决定，但契约要求它是模型支持的合法值 */
function nearestAspect(w: number, h: number, allowed: AspectRatio[]): AspectRatio {
  if (!allowed.length) return '1:1';
  const target = h ? w / h : 1;
  return allowed.reduce((best, r) =>
    Math.abs(ratioValue(r) - target) < Math.abs(ratioValue(best) - target) ? r : best,
  );
}

/**
 * 6 个工具页共用的外壳：上传 → 编辑 → 单张生成 → 前后对比。
 *
 * 与生成器的区别在于「一次一张、必须带底图」，所以这里的 batchCount 恒为 1，
 * 模型列表也按 `capabilities.modes[mode]` 预先筛过 —— 选不到不支持本工具的模型。
 */
export function ToolShell({
  mode,
  withPrompt = true,
  defaultPrompt = '',
  promptPlaceholder,
  renderEditor,
  buildExtra,
}: {
  mode: GenerationMode;
  withPrompt?: boolean;
  defaultPrompt?: string;
  promptPlaceholder?: string;
  /** 底图之上的编辑器（蒙版画笔 / 扩图手柄 / 风格图槽） */
  renderEditor?: (init: ToolAsset) => React.ReactNode;
  /** 组装 mode 专属字段；返回 null 表示前置条件没满足 */
  buildExtra?: (init: ToolAsset) => Promise<Record<string, unknown> | null>;
}) {
  const t = useTranslations('tools');
  const tg = useTranslations('generator');
  const qc = useQueryClient();
  const { data: models } = useModels();
  const { data: me } = useMe();
  const { data: charactersData } = useCharacters(Boolean(me));
  const characters = React.useMemo(
    () => charactersData?.items ?? [],
    [charactersData],
  );

  const [init, setInit] = React.useState<ToolAsset | null>(null);
  const [prompt, setPrompt] = React.useState(defaultPrompt);
  const [modelId, setModelId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [over, setOver] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const stream = useGenerationStream(activeId);

  const candidates = React.useMemo(
    () => (models ?? []).filter((m) => m.capabilities.modes[mode]),
    [models, mode],
  );

  // 默认选第一个支持本工具的模型；当前选中项被后台下线时也回到这里
  React.useEffect(() => {
    if (candidates.length && !candidates.some((m) => m.id === modelId)) {
      setModelId(candidates[0].id);
    }
  }, [candidates, modelId]);

  const model = candidates.find((m) => m.id === modelId) ?? null;

  // 钱在提交那一刻就冻结了，所以终态一出来就刷新余额
  React.useEffect(() => {
    if (stream.finished) void qc.invalidateQueries({ queryKey: ['me'] });
  }, [stream.finished, qc]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const a = await uploadAsset(file, 'UPLOAD');
      setInit({ id: a.assetId, url: a.url, width: a.width, height: a.height });
      setActiveId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!init || !model || pending) return;
    setError(null);
    setPending(true);
    setActiveId(null);
    try {
      const extra = buildExtra ? await buildExtra(init) : {};
      if (!extra) {
        setError(t('needEdit'));
        return;
      }
      // 与生成器页一致：无条件发 id，带不带参考图由服务端按能力决定
      const characterIds = characterIdsIn(prompt, characters);
      const res = await apiFetch<CreateGenerationResult>('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          modelId: model.id,
          idempotencyKey: uuid(),
          prompt,
          characters: characterIds.length ? characterIds : undefined,
          aspectRatio: nearestAspect(
            init.width,
            init.height,
            model.capabilities.supportedAspectRatios,
          ),
          resolution: model.capabilities.supportedResolutions[0],
          batchCount: 1,
          initAssetId: init.id,
          ...extra,
        }),
      });
      setActiveId(res.generationId);
      void qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.message : tg('errors.submitFailed'),
      );
    } finally {
      setPending(false);
    }
  };

  const cancel = async () => {
    if (!activeId) return;
    try {
      await apiFetch(`/api/generations/${activeId}/cancel`, { method: 'POST' });
      void qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : tg('errors.cancelFailed'));
    }
  };

  const busy = Boolean(activeId) && !stream.finished && !error;
  const result = stream.images.find((i) => i.status === 'SUCCEEDED' && i.url) ?? null;
  const cost = model ? perImageCost(model, mode) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {!init ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void pick(e.dataTransfer.files[0]);
            }}
            className={cn(
              'relative flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl border border-dashed transition-colors',
              over ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
            )}
          >
            {uploading ? (
              <Skeleton className="absolute inset-0 rounded-2xl" />
            ) : (
              <>
                <ImagePlus className="size-8 text-muted-foreground" />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => inputRef.current?.click()}
                >
                  {t('choose')}
                </Button>
                <p className="text-xs text-muted-foreground">{t('dropHint')}</p>
              </>
            )}
          </div>
        ) : renderEditor ? (
          renderEditor(init)
        ) : (
          <div
            className="checkerboard overflow-hidden rounded-xl border border-border"
            style={{ aspectRatio: `${init.width} / ${init.height}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={init.url} alt="" className="h-full w-full object-contain" />
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {init && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => inputRef.current?.click()}
            >
              <RotateCcw />
              {t('change')}
            </Button>
          )}
          {busy && (
            <span className="text-xs text-muted-foreground">{t('generating')}</span>
          )}
        </div>

        {result?.url ? (
          <div className="space-y-2">
            <CompareSlider
              before={init?.url ?? ''}
              after={result.url}
              aspect={`${result.width} / ${result.height}`}
              beforeLabel={t('before')}
              afterLabel={t('after')}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <a
                href={`/api/images/${result.id}/download`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8')}
              >
                <Download />
                {t('download')}
              </a>
              <span className="tabular-nums">
                {result.width}×{result.height} · {t('cost', { n: stream.creditsSpent })}
              </span>
            </div>
          </div>
        ) : busy ? (
          <div className="shimmer aspect-video rounded-xl border border-border" />
        ) : null}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <ModelSelector
          models={candidates}
          value={modelId}
          mode={mode}
          onChange={setModelId}
          disabled={busy || pending}
        />

        {withPrompt && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('promptLabel')}
            </span>
            <MentionTextarea
              value={prompt}
              onChange={setPrompt}
              characters={characters}
              // 本文件没有 cap 变量，就地算：模型不收 subject 时图片形象在候选里不可选
              subjectUnsupported={
                !(model?.capabilities.referenceRoles.includes('subject') ?? false)
              }
              placeholder={promptPlaceholder}
              rows={3}
              disabled={busy || pending}
              chromeClassName="rounded-lg border border-input bg-secondary/40 transition-colors focus-within:border-primary/50"
              className="min-h-20"
            />
          </div>
        )}

        <CostEstimate perImage={cost} batch={1} balance={me?.creditBalance} />

        <GenerateButton
          cost={cost}
          balance={me?.creditBalance}
          promptLength={prompt.length}
          maxChars={model?.capabilities.maxPromptChars ?? 2000}
          hasRequiredImage={Boolean(init)}
          pending={pending}
          running={busy}
          onSubmit={() => void submit()}
          onCancel={() => void cancel()}
        />

        {error && <p className="text-xs text-destructive">{error}</p>}
      </aside>
    </div>
  );
}
