import { z } from 'zod';
import { ok, route } from '@/server/http';
import { listPublishedPosts } from '@/server/explore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(48).default(20),
  category: z.string().optional(),
  tag: z.string().optional(),
  sort: z.enum(['latest', 'popular']).default('latest'),
  featured: z.enum(['0', '1']).optional(),
});

/** 作品广场（公开）。只出 PUBLISHED，草稿永远不露头。 */
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams));

  return ok(
    await listPublishedPosts({
      cursor: q.cursor,
      limit: q.limit,
      category: q.category,
      tag: q.tag,
      sort: q.sort,
      featured: q.featured === undefined ? undefined : q.featured === '1',
    }),
  );
});