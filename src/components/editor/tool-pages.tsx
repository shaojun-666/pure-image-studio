'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { NO_EXPAND, OutpaintEditor, type Expand } from '@/components/editor/expand-handles';
import { MaskCanvas, type MaskCanvasHandle } from '@/components/editor/mask-canvas';
import { ToolShell, type ToolAsset } from '@/components/editor/tool-shell';
import { Slot, type SlotAsset } from '@/components/generator/reference-slots';
import { uploadAsset } from '@/lib/upload';
import { cn } from '@/lib/utils';

/**
 * 6 个工具页的客户端实现。
 *
 * 每个工具只差三件事：生成模式、底图之上的编辑器、以及 mode 专属字段。
 * 上传 / 选模型 / 计费 / 提交 / 进度 / 对比这条主干全部由 ToolShell 承担，
 * 因此这里没有一处重复的请求逻辑。
 */

function ImagePreview({ asset, className }: { asset: ToolAsset; className?: string }) {
  return (
    <div
      className={cn('checkerboard overflow-hidden rounded-xl border border-border', className)}
      style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt="" className="h-full w-full object-contain" />
    </div>
  );
}

const maskExtra =
  (ref: React.RefObject<MaskCanvasHandle | null>) => async () => {
    const blob = await ref.current?.exportMask();
    if (!blob) return null;
    const a = await uploadAsset(blob, 'MASK');
    return { maskAssetId: a.assetId };
  };

export function BackgroundRemovalTool() {
  const t = useTranslations('tools.items.backgroundRemoval');
  // 抠图没有可调的语义参数：写什么提示词都改变不了去背结果，所以不给输入框
  return (
    <ToolShell mode="removeBackground" withPrompt={false} defaultPrompt={t('defaultPrompt')} />
  );
}

export function UpscaleTool() {
  const t = useTranslations('tools.items.upscale');
  const [factor, setFactor] = React.useState<2 | 4>(2);

  return (
    <ToolShell
      mode="upscale"
      withPrompt={false}
      defaultPrompt={t('defaultPrompt')}
      renderEditor={(init) => (
        <div className="space-y-4">
          <ImagePreview asset={init} />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              {([2, 4] as const).map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={factor === f ? 'default' : 'outline'}
                  onClick={() => setFactor(f)}
                >
                  {f}×
                </Button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('outputSize', { w: init.width * factor, h: init.height * factor })}
            </span>
          </div>
        </div>
      )}
      buildExtra={async () => ({ factor })}
    />
  );
}

export function InpaintTool() {
  const t = useTranslations('tools.items.inpaint');
  const maskRef = React.useRef<MaskCanvasHandle>(null);

  return (
    <ToolShell
      mode="inpaint"
      promptPlaceholder={t('promptPlaceholder')}
      renderEditor={(init) => (
        <MaskCanvas
          ref={maskRef}
          src={init.url}
          width={init.width}
          height={init.height}
        />
      )}
      buildExtra={maskExtra(maskRef)}
    />
  );
}

export function ObjectRemovalTool() {
  const t = useTranslations('tools.items.objectRemoval');
  const maskRef = React.useRef<MaskCanvasHandle>(null);

  return (
    <ToolShell
      mode="removeObject"
      defaultPrompt={t('defaultPrompt')}
      promptPlaceholder={t('promptPlaceholder')}
      renderEditor={(init) => (
        <MaskCanvas
          ref={maskRef}
          src={init.url}
          width={init.width}
          height={init.height}
        />
      )}
      buildExtra={maskExtra(maskRef)}
    />
  );
}

export function OutpaintTool() {
  const t = useTranslations('tools.items.outpaint');
  // 扩展量由下面的编辑器持有，提交时通过这个 ref 取 —— 见 OutpaintEditor 的说明
  const expandRef = React.useRef<Expand>(NO_EXPAND);

  return (
    <ToolShell
      mode="outpaint"
      defaultPrompt={t('defaultPrompt')}
      promptPlaceholder={t('promptPlaceholder')}
      renderEditor={(init) => (
        <OutpaintEditor key={init.id} init={init} valueRef={expandRef} />
      )}
      buildExtra={async () => {
        const e = expandRef.current;
        return e.top + e.right + e.bottom + e.left > 0 ? { expand: e } : null;
      }}
    />
  );
}

export function StyleTransferTool() {
  const t = useTranslations('tools.items.styleTransfer');
  const [style, setStyle] = React.useState<SlotAsset | null>(null);

  return (
    <ToolShell
      mode="styleTransfer"
      defaultPrompt={t('defaultPrompt')}
      promptPlaceholder={t('promptPlaceholder')}
      renderEditor={(init) => (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
          <ImagePreview asset={init} />
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('styleImage')}
            </span>
            <Slot
              asset={style}
              label={t('uploadStyle')}
              kind="STYLE_REF"
              onPick={(a) =>
                setStyle({ id: a.assetId, url: a.url, width: a.width, height: a.height })
              }
              onClear={() => setStyle(null)}
            />
          </div>
        </div>
      )}
      /**
       * ★ styleStrength 固定 0.7，不给用户调 —— 目前没有一家支持的模型收「强度」参数，
       *   百炼 qwen-image-edit 的参数表里也没有。原来那个滑杆是个会撒谎的控件：
       *   拖了、值发出去了、被静默丢弃，图完全一样。同 dashscope 的 supportsStrength 那条纪律。
       *   字段本身是 schema 必填，所以仍然要发。
       */
      buildExtra={async () => (style ? { styleAssetId: style.id, styleStrength: 0.7 } : null)}
    />
  );
}
