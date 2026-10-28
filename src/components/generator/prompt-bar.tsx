'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Wand2,
  Languages,
  Dices,
  Loader2,
  ChevronDown,
  ClipboardPaste,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { Tooltip } from '@/components/ui/tooltip';
import { PromptLibrary } from '@/components/generator/prompt-library';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { uploadAsset, type UploadedAsset } from '@/lib/upload';
import { characterIdsIn } from '@/lib/mention';
import { cn } from '@/lib/utils';
import type { GenerationMode } from '@/lib/ai/contracts';
import type { CharacterItem, PromptItem } from '@/types/generator';

export function PromptBar({
  prompt,
  onPromptChange,
  characters,
  subjectSupported,
  negative,
  onNegativeChange,
  mode,
  modelId,
  styleHint,
  maxChars,
  supportsNegative,
  onSubmit,
  onImagePasted,
  onError,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  /** 我的形象，供 @ 弹窗用 */
  characters: CharacterItem[];
  /** 当前模型是否实测支持 subject 参考图。false 时仍会注入描述，只是不带参考图 */
  subjectSupported: boolean;
  negative: string;
  onNegativeChange: (v: string) => void;
  mode: GenerationMode;
  modelId: string | null;
  styleHint?: string;
  maxChars: number;
  supportsNegative: boolean;
  onSubmit: () => void;
  onImagePasted: (a: UploadedAsset) => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations('generator.prompt');
  const tc = useTranslations('characters');
  const locale = useLocale();
  const [busy, setBusy] = React.useState<null | 'enhance' | 'translate' | 'random'>(null);
  const [showNegative, setShowNegative] = React.useState(false);

  const run = async (kind: 'enhance' | 'translate' | 'random') => {
    setBusy(kind);
    try {
      if (kind === 'enhance') {
        const r = await apiFetch<{ enhancedPrompt: string; negativePrompt?: string }>(
          '/api/prompt/enhance',
          {
            method: 'POST',
            body: JSON.stringify({ prompt, mode, locale, styleHint, modelId }),
          },
        );
        onPromptChange(r.enhancedPrompt);
        // 只在用户还没自己写反向提示词时填入，不覆盖已有的
        if (r.negativePrompt && supportsNegative && !negative.trim()) {
          onNegativeChange(r.negativePrompt);
          setShowNegative(true);
        }
      } else if (kind === 'translate') {
        const r = await apiFetch<{ text: string }>('/api/prompt/translate', {
          method: 'POST',
          body: JSON.stringify({ text: prompt, to: 'en', modelId }),
        });
        onPromptChange(r.text);
      } else {
        const p = await apiFetch<PromptItem>('/api/prompt/random');
        onPromptChange(p.prompt);
        if (p.negativePrompt && supportsNegative) {
          onNegativeChange(p.negativePrompt);
          setShowNegative(true);
        }
      }
    } catch (e) {
      onError(e instanceof ApiClientError ? e.message : t('toolFailed'));
    } finally {
      setBusy(null);
    }
  };

  // 粘贴图片即上传：比「先存盘再点上传」少三步
  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files)[0];
    if (!file?.type.startsWith('image/')) return;
    e.preventDefault();
    try {
      onImagePasted(await uploadAsset(file, 'REFERENCE'));
    } catch (err) {
      onError(err instanceof Error ? err.message : t('uploadFailed'));
    }
  };

  const over = prompt.length > maxChars;
  /**
   * 只有「引用了**图片形象**、而当前模型又不支持参考图」时才提示。
   * 两个收窄都是必要的：没引形象时这条信息与用户无关；只引文字形象时
   * 本来就没有图要带，提示它「没带图」是误报。
   */
  const referencedIds = characterIdsIn(prompt, characters);
  const textOnly =
    !subjectSupported &&
    characters.some((c) => referencedIds.includes(c.id) && c.assetId !== null);

  return (
    <div className="space-y-2">
      <MentionTextarea
        value={prompt}
        onChange={onPromptChange}
        characters={characters}
        subjectUnsupported={!subjectSupported}
        onPaste={onPaste}
        onKeyDown={(e) => {
          // Cmd/Ctrl + Enter 提交；单独 Enter 保留换行
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={3}
        placeholder={t('placeholder')}
        chromeClassName={cn(
          'rounded-xl border bg-secondary/40 transition-colors focus-within:border-primary/50',
          over ? 'border-destructive/60' : 'border-input',
        )}
        className="min-h-24 border-0 bg-transparent"
      >
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <Tooltip content={t('enhanceHint')}>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null || !prompt.trim()}
              onClick={() => run('enhance')}
            >
              {busy === 'enhance' ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Wand2 />
              )}
              {t('enhance')}
            </Button>
          </Tooltip>

          <Tooltip content={t('translateHint')}>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null || !prompt.trim()}
              onClick={() => run('translate')}
            >
              {busy === 'translate' ? <Loader2 className="animate-spin" /> : <Languages />}
              {t('translate')}
            </Button>
          </Tooltip>

          <Tooltip content={t('randomHint')}>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run('random')}>
              {busy === 'random' ? <Loader2 className="animate-spin" /> : <Dices />}
              {t('random')}
            </Button>
          </Tooltip>

          <PromptLibrary
            onApply={({ prompt: p, negativePrompt }) => {
              onPromptChange(p);
              // 与「随机灵感」同样的取舍：只填反向提示词，不覆盖用户已经写好的
              if (negativePrompt && supportsNegative && !negative.trim()) {
                onNegativeChange(negativePrompt);
                setShowNegative(true);
              }
            }}
          />

          {supportsNegative && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setShowNegative((v) => !v)}
            >
              <ChevronDown className={cn('transition-transform', showNegative && 'rotate-180')} />
              {t('negative')}
            </Button>
          )}

          <span
            className={cn(
              'text-xs tabular-nums',
              supportsNegative ? '' : 'ml-auto',
              over ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {prompt.length}/{maxChars}
          </span>
        </div>
      </MentionTextarea>

      {textOnly && (
        <p className="text-xs text-amber-500">{tc('textOnlyHint')}</p>
      )}

      {showNegative && supportsNegative && (
        <div className="space-y-1.5">
          <Textarea
            value={negative}
            onChange={(e) => onNegativeChange(e.target.value)}
            rows={2}
            placeholder={t('negativePlaceholder')}
            className="min-h-16"
          />
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ClipboardPaste className="size-3" />
        {t('pasteHint')}
      </p>
    </div>
  );
}
