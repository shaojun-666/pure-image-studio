import { ok, route } from '@/server/http';
import { errors } from '@/types/api';
import { findPublishedPost, serializeDetail } from '@/server/explore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 作品详情（公开）。params 一并返回，详情页的「一键同款」全靠它复现。 */
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;

    const post = await findPublishedPost(slug);
    if (!post) throw errors.notFound('作品不存在或未发布');

    return ok(serializeDetail(post));
  },
);
