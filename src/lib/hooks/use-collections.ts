'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { CollectionDTO, CollectionDetailDTO } from '@/types/generator';

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: () => apiFetch<{ items: CollectionDTO[] }>('/api/me/collections'),
    staleTime: 0,
  });
}

export function useCollection(id: string) {
  return useQuery({
    queryKey: ['collection', id],
    queryFn: () =>
      apiFetch<CollectionDetailDTO>(`/api/me/collections/${id}?limit=48`),
    enabled: Boolean(id),
  });
}

/**
 * 增删改和加图/移出都会动到「张数」和「封面」，而这两样卡片墙上要显示，
 * 所以一律连集合列表一起刷。id 传了才刷详情——新建/删除时还没有详情可刷。
 */
function useCollectionMutation<TInput>(
  fn: (input: TInput) => Promise<unknown>,
  id?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collections'] });
      if (id) void qc.invalidateQueries({ queryKey: ['collection', id] });
    },
  });
}

export const useCreateCollection = () =>
  useCollectionMutation((body: { name: string; description?: string }) =>
    apiFetch<CollectionDTO>('/api/me/collections', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );

export const useUpdateCollection = (id: string) =>
  useCollectionMutation(
    (body: { name?: string; description?: string | null }) =>
      apiFetch(`/api/me/collections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    id,
  );

export const useDeleteCollection = (id?: string) =>
  useCollectionMutation(
    () => apiFetch(`/api/me/collections/${id}`, { method: 'DELETE' }),
    id,
  );

export const useAddToCollection = (id: string) =>
  useCollectionMutation(
    (imageIds: string[]) =>
      apiFetch(`/api/me/collections/${id}/items`, {
        method: 'POST',
        body: JSON.stringify({ imageIds }),
      }),
    id,
  );

export const useRemoveFromCollection = (id: string) =>
  useCollectionMutation(
    (imageIds: string[]) =>
      apiFetch(`/api/me/collections/${id}/items`, {
        method: 'DELETE',
        body: JSON.stringify({ imageIds }),
      }),
    id,
  );
