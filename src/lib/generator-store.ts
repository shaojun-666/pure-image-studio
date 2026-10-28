'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AspectRatio,
  GenerationMode,
  Resolution,
} from '@/lib/ai/contracts';

/**
 * 生成器的草稿状态。只放「用户正在编辑什么」——
 * 生成结果属于服务端状态，归 TanStack Query 管，绝不进这里。
 *
 * 持久化到 localStorage：刷新页面不该丢掉刚写好的提示词。
 */
export interface GeneratorDraft {
  mode: GenerationMode;
  modelId: string | null;
  prompt: string;
  negativePrompt: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  batchCount: number;
  /** null = 每次随机 */
  seed: string | null;
  seedLocked: boolean;
  guidance: number;
  strength: number;
  stylePresetId: string | null;
  styleName: string | null;
  /**
   * imageToImage / inpaint / ... 的底图。宽高是源图像素，
   * 蒙版画笔按它建 canvas —— 少了这两个数就画不出与底图对齐的蒙版。
   */
  initAsset: { id: string; url: string; width: number; height: number } | null;
  /**
   * styleTransfer 的风格参考图，与 initAsset 分开存。
   * ★ 从前没有这个字段，buildBody 直接把 styleAssetId 写成底图的 id ——
   *   等于让那张图「迁移自己的风格」，什么都不会变，而服务端还照常扣费。
   */
  styleAsset: { id: string; url: string; width: number; height: number } | null;
  // 蒙版不进草稿：它在提交那一刻从画布导出后直接上传，
  // Asset 有 7 天 GC，存进持久化草稿只会留下过期引用

  patch: (p: Partial<GeneratorDraft>) => void;
  reset: () => void;
}

const INITIAL = {
  mode: 'textToImage' as GenerationMode,
  modelId: null,
  prompt: '',
  negativePrompt: '',
  aspectRatio: '1:1' as AspectRatio,
  resolution: '1K' as Resolution,
  batchCount: 1,
  seed: null,
  seedLocked: false,
  guidance: 7,
  strength: 0.6,
  stylePresetId: null,
  styleName: null,
  initAsset: null,
  styleAsset: null,
};

export const useGeneratorDraft = create<GeneratorDraft>()(
  persist(
    (set) => ({
      ...INITIAL,
      patch: (p) => set(p),
      reset: () => set(INITIAL),
    }),
    {
      name: 'pure.generator.draft',
      // 只持久化数据字段，不存函数
      partialize: ({ patch, reset, ...rest }) => rest,
    },
  ),
);

/** Remix：把一条历史记录的参数回填成新草稿 */
export function draftFromGeneration(g: {
  mode: GenerationMode;
  modelId: string;
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: string;
  resolution: string;
  batchCount: number;
  seed: string | null;
  guidance: number | null;
  strength: number | null;
  stylePresetId: string | null;
}): Partial<GeneratorDraft> {
  return {
    mode: g.mode,
    modelId: g.modelId,
    prompt: g.prompt,
    negativePrompt: g.negativePrompt ?? '',
    aspectRatio: g.aspectRatio as AspectRatio,
    resolution: g.resolution as Resolution,
    batchCount: g.batchCount,
    seed: g.seed,
    // 同款复现的关键：种子必须锁住，否则「一键同款」出的是另一张图
    seedLocked: Boolean(g.seed),
    guidance: g.guidance ?? 7,
    strength: g.strength ?? 0.6,
    stylePresetId: g.stylePresetId,
  };
}
