'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, RotateCcw, Sparkles } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ModeTabs } from '@/components/generator/mode-tabs';
import { ModelSelector } from '@/components/generator/model-selector';
import { PromptBar } from '@/components/generator/prompt-bar';
import { StylePicker } from '@/components/generator/style-picker';
import { AdvancedPanel } from '@/components/generator/advanced-panel';
import {
  AspectRatioPills,
  BatchCountPills,
  ResolutionPills,
} from '@/components/generator/param-controls';
import { ReferenceSlots, Slot } from '@/components/generator/reference-slots';
import { CostEstimate } from '@/components/generator/cost-estimate';
import { GenerateButton } from '@/components/generator/generate-button';
import { ResultGrid } from '@/components/gallery/result-grid';
import { ImageLightbox } from '@/components/gallery/image-lightbox';
import { MaskCanvas, type MaskCanvasHandle } from '@/components/editor/mask-canvas';
import { NO_EXPAND, OutpaintEditor, type Expand } from '@/components/editor/expand-handles';
import { Link } from '@/i18n/navigation';
import { uploadAsset } from '@/lib/upload';
import { uuid } from '@/lib/uuid';
import { useMe, useModels, useGeneration } from '@/lib/hooks/use-catalog';
import { useCharacters } from '@/lib/hooks/use-characters';
import { useGenerationStream } from '@/lib/hooks/use-generation-stream';
import { characterIdsIn } from '@/lib/mention';
import { useGeneratorDraft } from '@/lib/generator-store';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { perImageCost } from '@/lib/ai/pricing';
import { isImageInputMode, userBatchLimit, GENERATION_MODES } from '@/lib/ai/contracts';
import type { CreateGenerationResult, GenerationImageDTO } from '@/types/generator';

/** 需要画布编辑器的三个模式：蒙版画笔（重绘 / 消除）与扩图手柄 */
const EDITOR_MODES = new Set(['inpaint', 'outpaint', 'removeObject']);
/** 其中必须先涂出蒙版的；扩图只靠手柄，不涂也能提交 */
const MASK_MODES = new Set(['inpaint', 'removeObject']);

export function GeneratorShell() {
  const t = useTranslations('generator');
  const tc = useTranslations('common');
  const ta = useTranslations('auth');
  const qc = useQueryClient();

  const { data: models, isLoading: catalogLoading } = useModels();
  const { data: me } = useMe();
  // 未登录时别去拉：这一接口要鉴权，匿名访问只会换来一个 401
  const { data: charactersData } = useCharacters(Boolean(me));
  const characters = React.useMemo(
    () => charactersData?.items ?? [],
    [charactersData],
  );
  const draft = useGeneratorDraft();
  const patch = draft.patch;

  const list = React.useMemo(() => models ?? [], [models]);
  const model =
    list.find((m) => m.id === draft.modelId) ??
    list.find((m) => m.isDefault) ??
    list[0];

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // 未登录时点了生成：不弹红条报错，直接引导去登录
  const [needLogin, setNeedLogin] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(-1);
  const [maskReady, setMaskReady] = React.useState(false);
  const maskRef = React.useRef<MaskCanvasHandle>(null);
  const expandRef = React.useRef<Expand>(NO_EXPAND);

  const stream = useGenerationStream(activeId);
  const { data: activeGen } = useGeneration(activeId);

  // 首次拿到目录时选中默认模型
  React.useEffect(() => {
    if (!draft.modelId && list.length) {
      patch({ modelId: (list.find((m) => m.isDefault) ?? list[0]).id });
    }
  }, [list, draft.modelId, patch]);

  /**
   * 约束收敛：换模型后，原来选的档位可能不再被支持。
   * 每次只收敛到一个合法值，因此第二次运行必然无事可做，不会死循环。
   */
  React.useEffect(() => {
    if (!model) return;
    const cap = model.capabilities;
    const next: Partial<typeof draft> = {};

    if (!cap.modes[draft.mode]) {
      next.mode = GENERATION_MODES.find((m) => cap.modes[m]) ?? draft.mode;
    }
    if (!cap.supportedResolutions.includes(draft.resolution)) {
      next.resolution = cap.supportedResolutions[0];
    }
    if (!cap.supportedAspectRatios.includes(draft.aspectRatio)) {
      next.aspectRatio = cap.supportedAspectRatios[0];
    }
    const maxBatch = userBatchLimit(cap);
    if (draft.batchCount > maxBatch) next.batchCount = maxBatch;

    if (Object.keys(next).length) patch(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, draft.mode, draft.resolution, draft.aspectRatio, draft.batchCount]);

  // 钱在提交那一刻就已经冻结了，所以提交成功就刷新余额，而不是等生成结束
  React.useEffect(() => {
    if (stream.finished) {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['generations'] });
      if (activeId) void qc.invalidateQueries({ queryKey: ['generation', activeId] });
    }
  }, [stream.finished, activeId, qc]);

  const cost = model ? perImageCost(model, draft.mode) : 0;
  const needsInit = isImageInputMode(draft.mode);
  /** 风格迁移要两张图：底图 + 风格参考图。缺风格图那条路里 styleAssetId 只能拿底图顶替 ——
   *  迁移自己的风格，图不变、钱照扣，所以这里必须挡住 */
  const needsStyle = draft.mode === 'styleTransfer';
  const needsEditor = EDITOR_MODES.has(draft.mode);
  const needsMask = MASK_MODES.has(draft.mode);
  /** 旧草稿里的底图可能没有尺寸（Phase 3 的槽位没存），没尺寸就画不了蒙版 */
  const canUseEditor = Boolean(draft.initAsset?.width);
  // 编辑器模式要「底图到位 + 该涂的蒙版涂了」才放行，否则提交上去只会白跑一趟
  const editorReady = !needsEditor || (canUseEditor && (!needsMask || maskReady));
  const hasRequiredImage =
    (!needsInit || Boolean(draft.initAsset)) &&
    (!needsStyle || Boolean(draft.styleAsset)) &&
    editorReady;
  const running = Boolean(activeId) && !stream.finished && !error;
  // 槽位数：已提交但流还没回来时先用草稿的批量数，骨架格才能从点击那刻就就位
  const gridCount =
    stream.batchCount || (pending || activeId ? draft.batchCount : 0);

  const buildBody = (maskAssetId: string | null, expand: Expand) => {
    if (!model) throw new Error('no model');
    const characterIds = characterIdsIn(draft.prompt, characters);
    const base = {
      modelId: model.id,
      idempotencyKey: uuid(),
      prompt: draft.prompt.trim(),
      negativePrompt: draft.negativePrompt.trim() || undefined,
      aspectRatio: draft.aspectRatio,
      resolution: draft.resolution,
      batchCount: draft.batchCount,
      // 没锁种子就不传，让服务端/上游自己摇一个
      seed: draft.seedLocked && draft.seed ? draft.seed : undefined,
      guidance: model.capabilities.supportsGuidance ? draft.guidance : undefined,
      stylePresetId: draft.stylePresetId ?? undefined,
      /**
       * ★ 无条件发，**不按模型能力筛**。形象有两条注入路径：
       *   描述注入 —— 全模式全模型都能用，这是兜底那条
       *   参考图   —— 只有实测支持 subject 的模型能用
       * 该不该带参考图由服务端的 resolveCharacters 按 capabilities.referenceRoles 决定；
       * 客户端在这里筛，等于让不支持参考图的模型连描述一起丢掉。
       */
      characters: characterIds.length ? characterIds : undefined,
    };

    switch (draft.mode) {
      case 'imageToImage':
        return {
          ...base,
          mode: 'imageToImage' as const,
          initAssetId: draft.initAsset!.id,
          /**
           * ★ 不支持的模型不能带这个字段。create.ts 用 `'strength' in body` 判 hasStrength，
           * 带上就会被能力校验以「不支持强度调节」挡下 —— 方舟和 ofox 都是 supportsStrength:false，
           * 从前无条件发这一行，等于这两家的图生图在服务端永远走不通。
           * 处理方式与上面 guidance 那行一致。
           */
          strength: model.capabilities.supportsStrength ? draft.strength : undefined,
        };
      case 'inpaint':
      case 'removeObject':
        return {
          ...base,
          mode: draft.mode,
          initAssetId: draft.initAsset!.id,
          // 蒙版在提交那一刻才由画布导出，所以只能当参数传进来
          maskAssetId: maskAssetId!,
        };
      case 'outpaint':
        return {
          ...base,
          mode: 'outpaint' as const,
          initAssetId: draft.initAsset!.id,
          expand,
        };
      case 'removeBackground':
        return {
          ...base,
          mode: 'removeBackground' as const,
          initAssetId: draft.initAsset!.id,
          returnAlpha: true,
        };
      case 'upscale':
        return {
          ...base,
          mode: 'upscale' as const,
          initAssetId: draft.initAsset!.id,
          factor: 2 as const,
        };
      case 'styleTransfer':
        return {
          ...base,
          mode: 'styleTransfer' as const,
          initAssetId: draft.initAsset!.id,
          styleAssetId: draft.styleAsset!.id,
          /**
           * ★ 固定值，不是用户可调的。目前没有任何一家支持的模型收「强度」参数，
           *   百炼的 qwen-image-edit 参数表里也没有 —— 给了也是被静默丢弃。
           *   所以工具页那个强度滑杆已经拆了，这里保留字段只是因为 schema 要求它。
           */
          styleStrength: 0.7,
        };
      default:
        return { ...base, mode: 'textToImage' as const };
    }
  };

  const submit = async () => {
    if (pending || !model) return;
    setError(null);

    /**
     * 蒙版在提交这一刻才导出并上传。
     * 草稿是持久化的，而 Asset 有 7 天 GC —— 把 assetId 写进草稿，
     * 用户隔周回来点生成就是一个「引用了已被回收的图」的 404。
     */
    let maskAssetId: string | null = null;
    if (needsMask) {
      try {
        const blob = await maskRef.current?.exportMask();
        if (blob) maskAssetId = (await uploadAsset(blob, 'MASK')).assetId;
      } catch {
        setError(t('errors.maskUploadFailed'));
        return;
      }
      if (!maskAssetId) {
        setError(t('errors.maskRequired'));
        return;
      }
    }

    // 扩图不拖手柄就等于什么都没做，但照样会扣钱。工具页靠 buildExtra 返回 null 挡住，
    // 这里没有那层，得自己拦一道。
    if (needsEditor && !needsMask) {
      const e = expandRef.current;
      if (e.top + e.right + e.bottom + e.left === 0) {
        setError(t('errors.expandRequired'));
        return;
      }
    }

    setPending(true);
    // 立刻把网格切成「本批次的骨架格」，而不是继续显示上一次的结果
    setActiveId(null);
    setLightbox(-1);
    try {
      const res = await apiFetch<CreateGenerationResult>('/api/generate', {
        method: 'POST',
        body: JSON.stringify(buildBody(maskAssetId, expandRef.current)),
      });
      setActiveId(res.generationId);
      void qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      // 401 的 message 是给开发者看的，对用户不如直接给一个登录入口
      if (e instanceof ApiClientError && e.status === 401) {
        setNeedLogin(true);
      } else {
        setError(
          e instanceof ApiClientError ? e.message : t('errors.submitFailed'),
        );
      }
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
      setError(e instanceof ApiClientError ? e.message : t('errors.cancelFailed'));
    }
  };

  const toggleFavorite = async (image: GenerationImageDTO) => {
    try {
      await apiFetch(`/api/images/${image.id}/favorite`, { method: 'POST' });
      void qc.invalidateQueries({ queryKey: ['generation', activeId] });
      void qc.invalidateQueries({ queryKey: ['generations'] });
    } catch {
      /* 收藏失败不打断创作流程 */
    }
  };

  if (catalogLoading || !model) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <Skeleton className="h-[32rem]" />
          <Skeleton className="h-[32rem]" />
        </div>
      </div>
    );
  }

  const cap = model.capabilities;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      {/* 模式 Tab 占满整行：塞在左侧栏里时 8 个模式在桌面端会溢出成横向滚动，
          没有可见滚动条等于「放大 / 消除 / 风格迁移」三个模式点不到 */}
      <div className="lg:col-span-2">
        <ModeTabs
          model={model}
          value={draft.mode}
          onChange={(mode) => patch({ mode })}
        />
      </div>

      {/* ── 左侧控制栏 ── */}
      <aside className="space-y-5">
        <ModelSelector
          models={list}
          value={model.id}
          mode={draft.mode}
          onChange={(id) => {
            /**
             * ★ 换模型时若当前模式不被支持，把模式一起切过去。
             *   不这么做就会卡在「模型已换、模式却还是灰的」——
             *   模式看模型能力置灰、模型原来又看模式置灰，互相锁死（详见 model-selector 的说明）。
             */
            const next = list.find((m) => m.id === id);
            const nextMode =
              next && !next.capabilities.modes[draft.mode]
                ? GENERATION_MODES.find((m) => next.capabilities.modes[m])
                : undefined;
            patch({ modelId: id, ...(nextMode ? { mode: nextMode } : {}) });
          }}
        />

        <StylePicker
          value={draft.stylePresetId}
          valueName={draft.styleName}
          onChange={(s) =>
            patch({ stylePresetId: s?.id ?? null, styleName: s?.name ?? null })
          }
        />

        {needsInit && (
          // 参考图槽（角色选择 + 权重）还没落地，这里只有底图
          <ReferenceSlots
            variant="init"
            cap={cap}
            mode={draft.mode}
            initAsset={draft.initAsset}
            onInitChange={(a) => patch({ initAsset: a })}
          />
        )}

        {needsStyle && (
          <div className="space-y-3 rounded-xl border border-border/70 p-3">
            <span className="text-xs font-medium text-muted-foreground">
              {t('reference.styleImage')}
            </span>
            <Slot
              asset={draft.styleAsset}
              label={t('reference.styleUpload')}
              kind="STYLE_REF"
              onPick={(a) =>
                patch({
                  styleAsset: {
                    id: a.assetId,
                    url: a.url,
                    width: a.width,
                    height: a.height,
                  },
                })
              }
              onClear={() => patch({ styleAsset: null })}
            />
          </div>
        )}

        <AspectRatioPills
          cap={cap}
          value={draft.aspectRatio}
          resolution={draft.resolution}
          onChange={(aspectRatio) => patch({ aspectRatio })}
        />

        <ResolutionPills
          cap={cap}
          value={draft.resolution}
          onChange={(resolution) => patch({ resolution })}
        />

        <BatchCountPills
          cap={cap}
          value={draft.batchCount}
          onChange={(batchCount) => patch({ batchCount })}
        />

        <AdvancedPanel
          cap={cap}
          mode={draft.mode}
          seed={draft.seed}
          seedLocked={draft.seedLocked}
          guidance={draft.guidance}
          strength={draft.strength}
          onChange={(p) => patch(p)}
        />

        <div className="space-y-3 rounded-xl border border-border/70 p-3">
          <CostEstimate perImage={cost} batch={draft.batchCount} balance={me?.creditBalance} />
          <GenerateButton
            cost={cost * draft.batchCount}
            balance={me?.creditBalance}
            promptLength={draft.prompt.trim().length}
            maxChars={cap.maxPromptChars}
            hasRequiredImage={hasRequiredImage}
            pending={pending}
            running={running}
            onSubmit={submit}
            onCancel={cancel}
          />
          <p className="text-center text-[11px] text-muted-foreground">
            {t('shortcutHint')}
          </p>
        </div>
      </aside>

      {/* ── 右侧：提示词 + 结果 ── */}
      <section className="space-y-5">
        <PromptBar
          prompt={draft.prompt}
          onPromptChange={(prompt) => patch({ prompt })}
          characters={characters}
          subjectSupported={cap.referenceRoles.includes('subject')}
          negative={draft.negativePrompt}
          onNegativeChange={(negativePrompt) => patch({ negativePrompt })}
          mode={draft.mode}
          modelId={model.id}
          styleHint={draft.styleName ?? undefined}
          maxChars={cap.maxPromptChars}
          supportsNegative={cap.supportsNegativePrompt}
          onSubmit={submit}
          onImagePasted={(a) =>
            patch({ initAsset: { id: a.assetId, url: a.url, width: a.width, height: a.height } })
          }
          onError={setError}
        />

        {/* 画布编辑器就放在提示词下面、结果上面：涂抹和看结果一眼之内完成，
            不必在两栏之间来回找。key 跟着底图走，换图即清空笔画。 */}
        {needsEditor && draft.initAsset && (
          <div className="space-y-2 rounded-xl border border-border/70 p-3">
            {canUseEditor ? (
              <>
                <p className="text-xs font-medium text-muted-foreground">
                  {needsMask ? t('editor.maskHint') : t('editor.expandHint')}
                </p>
                {needsMask ? (
                  <MaskCanvas
                    key={draft.initAsset.id}
                    ref={maskRef}
                    src={draft.initAsset.url}
                    width={draft.initAsset.width}
                    height={draft.initAsset.height}
                    onMaskChange={setMaskReady}
                  />
                ) : (
                  <OutpaintEditor
                    key={draft.initAsset.id}
                    init={draft.initAsset}
                    valueRef={expandRef}
                  />
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t('editor.needReupload')}</p>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-xs underline">
              {t('dismiss')}
            </button>
          </div>
        )}

        {stream.status && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            <span>{t(`status.${stream.status}` as never)}</span>
            {stream.batchCount > 0 && (
              <span className="tabular-nums">
                {t('progress', {
                  done: stream.succeededCount + stream.failedCount,
                  total: stream.batchCount,
                })}
              </span>
            )}
            {stream.creditsRefunded > 0 && (
              <span className="text-emerald-400">
                {t('refunded', { n: stream.creditsRefunded })}
              </span>
            )}
            {stream.finished && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => {
                  setActiveId(null);
                  setError(null);
                }}
              >
                <RotateCcw />
                {t('actions.clear')}
              </Button>
            )}
          </div>
        )}

        <ResultGrid
          images={stream.images}
          batchCount={gridCount}
          aspectRatio={draft.aspectRatio}
          resolution={draft.resolution}
          onFavorite={toggleFavorite}
          onRemix={(image) => {
            // 用这张图的种子再生成一批：这就是「变体」
            patch({ seed: image.seed, seedLocked: true });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpen={setLightbox}
        />

        {activeGen && lightbox >= 0 && (
          <ImageLightbox
            generation={activeGen}
            images={stream.images}
            index={lightbox}
            models={list}
            styleName={draft.styleName}
            onIndexChange={setLightbox}
            onClose={() => setLightbox(-1)}
            onRemix={() => {
              const image = stream.images[lightbox];
              patch({ seed: image?.seed ?? null, seedLocked: true });
              setLightbox(-1);
            }}
          />
        )}
      </section>

      <Dialog
        open={needLogin}
        onClose={() => setNeedLogin(false)}
        title={t('loginRequired.title')}
        description={t('loginRequired.desc')}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setNeedLogin(false)}>
            {tc('cancel')}
          </Button>
          <Link href="/login" className={buttonVariants()}>
            {ta('goLogin')}
          </Link>
        </div>
      </Dialog>
    </div>
  );
}
