/**
 * DB 里的多语言字段都是 `{ zh, en }` 的 JSON 列。
 * 本地化在**客户端**做：接口原样返回 map，响应因此与语言无关、可跨语言共用缓存。
 */
export function pickI18n(
  map: unknown,
  locale: string,
  fallback = 'zh',
): string {
  if (!map || typeof map !== 'object') return '';
  const m = map as Record<string, string>;
  return m[locale] ?? m[fallback] ?? Object.values(m)[0] ?? '';
}
