'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/types/api';
import type {
  CatalogModel,
  ExploreCardDTO,
  GenerationDTO,
  LedgerRowDTO,
  MeStatsDTO,
  PromptItem,
  StyleItem,
} from '@/types/generator';

export interface MeDTO {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: 'USER' | 'ADMIN';
  locale: string;
  creditBalance: number;
  createdAt: string;
  dailyGrant: { granted: boolean; amount?: number; nextAt: string };
}

/**
 * 目录类查询集中在这里，统一 queryKey 与 staleTime。
 * 模型/风格/提示词都很少变，缓存久一点，切页面不闪。
 */
export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => apiFetch<CatalogModel[]>('/api/models'),
    staleTime: 5 * 60_000,
  });
}

export function useStyles(params: {
  category?: string;
  q?: string;
  mine?: boolean;
  enabled?: boolean;
}) {
  const { category = 'all', q = '', mine = false, enabled = true } = params;
  return useQuery({
    queryKey: ['styles', category, q, mine],
    queryFn: () =>
      apiFetch<Paginated<StyleItem>>(
        `/api/styles?category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}${mine ? '&mine=1' : ''}&limit=60`,
      ),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function usePrompts(params: { category?: string; q?: string; enabled?: boolean }) {
  const { category = 'all', q = '', enabled = true } = params;
  return useQuery({
    queryKey: ['prompts', category, q],
    queryFn: () =>
      apiFetch<Paginated<PromptItem>>(
        `/api/prompts?category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}&limit=60`,
      ),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useMe(enabled = true) {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeDTO>('/api/me'),
    staleTime: 0,
    enabled,
    retry: false,
  });
}

export function useGenerations(params: {
  mode?: string;
  modelId?: string;
  favorited?: boolean;
}) {
  const { mode = '', modelId = '', favorited = false } = params;
  const qs = new URLSearchParams();
  if (mode && mode !== 'all') qs.set('mode', mode);
  if (modelId) qs.set('modelId', modelId);
  if (favorited) qs.set('favorited', '1');

  return useQuery({
    queryKey: ['generations', mode, modelId, favorited],
    queryFn: () =>
      apiFetch<Paginated<GenerationDTO>>(`/api/generations?limit=24&${qs}`),
  });
}

export function useGeneration(id: string | null) {
  return useQuery({
    queryKey: ['generation', id],
    queryFn: () => apiFetch<GenerationDTO>(`/api/generations/${id}`),
    enabled: Boolean(id),
  });
}

export function useMeStats() {
  return useQuery({
    queryKey: ['me', 'stats'],
    queryFn: () => apiFetch<MeStatsDTO>('/api/me/stats'),
    staleTime: 60_000,
  });
}

export function useLedger() {
  return useQuery({
    queryKey: ['me', 'ledger'],
    queryFn: () => apiFetch<Paginated<LedgerRowDTO>>('/api/me/credits/ledger?limit=20'),
    staleTime: 0,
  });
}

export function useExplore(
  params: {
    category?: string;
    tag?: string;
    sort?: 'latest' | 'popular';
    featured?: boolean;
  },
  /**
   * 服务端首屏数据。只允许在筛选条件为默认值时传 ——
   * initialData 会套到本 hook 建立的**每一个** queryKey 上，
   * 切分类时若还传着「全部」的首屏数据，会先闪一屏不匹配的卡片。
   */
  initial?: Paginated<ExploreCardDTO>,
) {
  const { category = 'all', tag = '', sort = 'latest', featured = false } = params;
  const qs = new URLSearchParams({ limit: '24', sort });
  if (category && category !== 'all') qs.set('category', category);
  if (tag) qs.set('tag', tag);
  if (featured) qs.set('featured', '1');

  return useQuery({
    queryKey: ['explore', category, tag, sort, featured],
    queryFn: () => apiFetch<Paginated<ExploreCardDTO>>(`/api/explore?${qs}`),
    staleTime: 60_000,
    initialData: initial,
  });
}
