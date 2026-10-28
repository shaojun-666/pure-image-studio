import type { GenerationMode, ModelDescriptor } from './contracts';

/** 积分规则。模式倍率叠加在模型的 creditCost 之上。 */
export const CREDIT_CONFIG = {
  signupBonus: 30,
  dailyFreeCredits: 20,
  dailyGrantTimezone: 'Asia/Shanghai',
  modeMultiplier: {
    textToImage: 1,
    imageToImage: 1,
    inpaint: 1.2,
    outpaint: 1.2,
    removeBackground: 0.5,
    upscale: 2,
    styleTransfer: 1.2,
    removeObject: 1,
  } satisfies Record<GenerationMode, number>,
} as const;

/** 单张实际扣费 = ceil(基础价 × 模式倍率) */
export function perImageCost(
  model: Pick<ModelDescriptor, 'creditCost'>,
  mode: GenerationMode,
): number {
  const mult = CREDIT_CONFIG.modeMultiplier[mode] ?? 1;
  return Math.max(1, Math.ceil(model.creditCost * mult));
}

export function computeCost(
  model: Pick<ModelDescriptor, 'creditCost'>,
  mode: GenerationMode,
  batch: number,
): { perImage: number; total: number } {
  const perImage = perImageCost(model, mode);
  return { perImage, total: perImage * batch };
}
