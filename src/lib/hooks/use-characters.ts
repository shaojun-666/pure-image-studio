'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { CharacterItem } from '@/types/generator';

/**
 * 我的形象。
 *
 * 与 use-catalog 里的目录类查询不同，这个**不设 staleTime** ——
 * 形象是用户自己随时在建、在改、在删的东西，缓存久了只会让 @ 弹窗里
 * 出现已经删掉的名字。改动一律走下面的 mutation 去 invalidate。
 */
export function useCharacters(enabled = true) {
  return useQuery({
    queryKey: ['characters'],
    queryFn: () => apiFetch<{ items: CharacterItem[] }>('/api/characters'),
    staleTime: 0,
    enabled,
  });
}

export interface CreateCharacterInput {
  name: string;
  description: string;
  /** 二选一：上传得到的 assetId，或历史生成里的 imageId */
  assetId?: string;
  imageId?: string;
}

export function useCreateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCharacterInput) =>
      apiFetch<CharacterItem>('/api/characters', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['characters'] }),
  });
}

export function useUpdateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name?: string; description?: string }) =>
      apiFetch<CharacterItem>(`/api/characters/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: input.name, description: input.description }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['characters'] }),
  });
}

export function useDeleteCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/characters/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['characters'] }),
  });
}
