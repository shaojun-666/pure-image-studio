import { ok, route } from '@/server/http';
import { listEffectiveModels } from '@/server/providers/registry';

export const runtime = 'nodejs';
// 目录是公开且低频变更的，让 CDN / 浏览器缓存 60 秒
export const revalidate = 60;

/**
 * 模型目录。这是「加模型零改前端」的接口面：
 * 前端全部控件都由返回的 capabilities 驱动，页面里不出现任何厂商或模型名。
 */
export const GET = route(async () => {
  const models = await listEffectiveModels();
  return ok(models);
});
