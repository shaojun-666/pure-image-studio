'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, Heart, Sparkles, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/common/copy-button';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api-client';
import { draftFromGeneration, useGeneratorDraft } from '@/lib/generator-store';
import { pickI18n } from '@/lib/i18n';
import type { ExploreDetailDTO } from '@/types/generator';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 py-2 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="ml-auto flex min-w-0 items-center gap-1 truncate text-right">
        {children}
      </span>
    </div>
  );
}

export function ExploreDetail({ post }: { post: ExploreDetailDTO }) {
  const t = useTranslations('explore');
  const locale = useLocale();
  const router = useRouter();
  const patch = useGeneratorDraft((s) => s.patch);

  // 浏览量只在挂载时 +1。用 ref 挡住 StrictMode 下的二次 effect，
  // 否则开发模式下每开一次详情页都算两次。
  const viewed = React.useRef(false);
  React.useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    void apiFetch(`/api/explore/${post.slug}/view`, { method: 'POST' }).catch(() => {});
  }, [post.slug]);

  const remix = () => {
    const draft = draftFromGeneration({
      mode: 'textToImage',
      modelId: post.modelId ?? '',
      prompt: post.prompt,
      negativePrompt: post.negativePrompt,
      aspectRatio: post.params.aspectRatio ?? post.aspectRatio,
      resolution: post.params.resolution ?? '1K',
      batchCount: 1,
      seed: post.params.seed ?? null,
      guidance: post.params.guidance ?? null,
      strength: null,
      stylePresetId: post.stylePresetId,
    });
    // 没写模型就不要把空串塞进草稿 —— 留空由生成器回退到默认模型
    if (!post.modelId) delete draft.modelId;
    patch(draft);
    router.push('/generate');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <Link href="/explore" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('title')}
        </Link>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-secondary/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.coverUrl}
            alt={pickI18n(post.titleI18n, locale)}
            className="w-full object-contain"
          />
        </div>
      </div>

      <aside className="space-y-4">
        <div className="space-y-2">
          {post.featured && (
            <Badge>
              <Sparkles className="size-3" />
              {t('featured')}
            </Badge>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">
            {pickI18n(post.titleI18n, locale)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pickI18n(post.descriptionI18n, locale)}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3.5" />
              {post.likeCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" />
              {post.viewCount}
            </span>
          </div>
        </div>

        <Button className="w-full" onClick={remix}>
          <Wand2 className="size-4" />
          {t('remix')}
        </Button>
        <p className="-mt-2 text-center text-xs text-muted-foreground">{t('remixHint')}</p>

        <div className="rounded-xl border border-border/70 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('prompt')}</span>
            <CopyButton value={post.prompt} className="ml-auto" />
          </div>
          {/* 提示词是用户要复制走的产物，永不翻译 */}
          <p className="mt-1.5 text-sm leading-relaxed">{post.prompt}</p>
          {post.negativePrompt && (
            <>
              <p className="mt-3 text-xs text-muted-foreground">{t('negativePrompt')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{post.negativePrompt}</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border/70 px-3 py-1">
          {post.modelId && (
            <Row label={t('model')}>
              <span className="font-mono text-xs">{post.modelId}</span>
            </Row>
          )}
          <Row label={t('aspectRatio')}>{post.params.aspectRatio ?? post.aspectRatio}</Row>
          {post.params.resolution && <Row label={t('resolution')}>{post.params.resolution}</Row>}
          {post.params.seed && (
            <Row label={t('seed')}>
              <span className="font-mono text-xs">{post.params.seed}</span>
              <CopyButton value={post.params.seed} />
            </Row>
          )}
          {post.params.guidance != null && (
            <Row label={t('guidance')}>{post.params.guidance}</Row>
          )}
          {post.publishedAt && (
            <Row label={t('publishedAt')}>
              {new Date(post.publishedAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-CN')}
            </Row>
          )}
        </div>

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
