import type { CharacterItem } from '@/types/generator';

/** 形象 token 的字面量形态。方括号是必需的：中文名没有空格，无法判断名字到哪儿结束 */
export const CHARACTER_TOKEN_RE = /@\[([^\]\n]+)\]/g;

/** 一次生成最多引用几个形象。与服务端 schema 的 max(3) 和厂商的参考图上限对齐 */
export const MAX_CHARACTERS_PER_GENERATION = 3;

/**
 * 从提示词里取出被引用的形象 id，按**首次出现顺序**去重。
 *
 * ★ 名字对名字的反查放在客户端做，服务端只收 id、不解析提示词 ——
 *   否则名字里带 `[` `]` 之类的字符时，解析会出现歧义（见 schema.ts 的 characters 字段）。
 *
 * 对不上任何已知形象（用户手敲的字面量、或形象已被删除）的 token 直接忽略，
 * 不报错：提示词里留着 `@[旧名]` 只是一段普通文字，不该让提交失败。
 */
export function characterIdsIn(
  prompt: string,
  characters: CharacterItem[],
): string[] {
  if (!prompt.includes('@[') || !characters.length) return [];
  const byName = new Map(characters.map((c) => [c.name, c.id]));
  const ids: string[] = [];
  for (const m of prompt.matchAll(CHARACTER_TOKEN_RE)) {
    const id = byName.get(m[1]);
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= MAX_CHARACTERS_PER_GENERATION) break;
  }
  return ids;
}
