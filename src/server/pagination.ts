import type { Paginated } from '@/types/api';

/**
 * 游标分页：多取一条来判断还有没有下一页，避免额外的 count 查询。
 * 游标就是上一页最后一条的 id（cuid 单调，配合 orderBy 稳定）。
 */
export function cursorArgs(cursor: string | null | undefined, take: number) {
  return {
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

export function slicePage<T extends { id: string }>(
  rows: T[],
  take: number,
): Paginated<T> {
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export const PAGE_SIZE = 24;
