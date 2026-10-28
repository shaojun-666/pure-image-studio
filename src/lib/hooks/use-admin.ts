'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/types/api';

/** 后台所有列表都是游标分页，统一取第一页（后台数据量小，不做无限滚动） */
const page = <T,>(path: string, params: Record<string, string | number | boolean | undefined>) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return apiFetch<Paginated<T>>(`${path}?${qs}`);
};

// ───────────────────────── 类型 ─────────────────────────

export interface AdminStatsDTO {
  totals: {
    users: number;
    generations: number;
    images: number;
    publishedPosts: number;
    creditsSpent: number;
  };
  statusCounts: Record<string, number>;
  days: { day: string; generations: number; images: number }[];
  recentGenerations: {
    id: string;
    status: string;
    mode: string;
    modelId: string;
    email: string;
    createdAt: string;
  }[];
  audit: {
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    diff: unknown;
    createdAt: string;
    admin: { email: string };
  }[];
}

export interface AdminExploreRow {
  id: string;
  slug: string;
  titleI18n: Record<string, string>;
  coverUrl: string;
  category: string | null;
  tags: string[];
  featured: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  sortOrder: number;
  modelId: string | null;
  publishedAt: string | null;
}

export interface AdminModelRow {
  id: string;
  providerKey: string;
  displayName: Record<string, string>;
  tier: string;
  creditCost: number;
  sortOrder: number;
  enabled: boolean;
  isVisible: boolean;
  creditCostOverride: number | null;
  badgeI18n: Record<string, string> | null;
  badge?: Record<string, string>;
  hasRow: boolean;
  capabilities: {
    maxBatch: number;
    modes: Record<string, boolean>;
  };
}

export interface AdminStyleRow {
  id: string;
  slug: string;
  nameI18n: Record<string, string>;
  category: string;
  tags: string[];
  thumbnailUrl: string;
  promptSuffix: string;
  enabled: boolean;
  isCurated: boolean;
  ownerUserId: string | null;
  sortOrder: number;
  usageCount: number;
}

export interface AdminPromptRow {
  id: string;
  slug: string;
  titleI18n: Record<string, string>;
  prompt: string;
  negativePrompt: string | null;
  category: string;
  tags: string[];
  enabled: boolean;
  isCurated: boolean;
  ownerUserId: string | null;
  sortOrder: number;
  usageCount: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  status: string;
  creditBalance: number;
  generationCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminGenerationRow {
  id: string;
  status: string;
  mode: string;
  modelId: string;
  prompt: string;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  creditsHeld: number;
  creditsSpent: number;
  creditsRefunded: number;
  succeededCount: number;
  failedCount: number;
  batchCount: number;
  email: string;
  createdAt: string;
}

// ───────────────────────── 查询 ─────────────────────────

export const useAdminStats = () =>
  useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiFetch<AdminStatsDTO>('/api/admin/stats'),
    refetchInterval: 30_000,
  });

export const useAdminExplore = (q: { q?: string; status?: string } = {}) =>
  useQuery({
    queryKey: ['admin', 'explore', q],
    queryFn: () => page<AdminExploreRow>('/api/admin/explore', q),
    refetchInterval: 20_000,
  });

export const useAdminModels = () =>
  useQuery({
    queryKey: ['admin', 'models'],
    queryFn: () => apiFetch<AdminModelRow[]>('/api/admin/models'),
  });

export const useAdminStyles = (q: { q?: string; category?: string } = {}) =>
  useQuery({
    queryKey: ['admin', 'styles', q],
    queryFn: () => page<AdminStyleRow>('/api/admin/styles', q),
  });

export const useAdminPrompts = (q: { q?: string; category?: string } = {}) =>
  useQuery({
    queryKey: ['admin', 'prompts', q],
    queryFn: () => page<AdminPromptRow>('/api/admin/prompts', q),
  });

export const useAdminUsers = (q: { q?: string; role?: string } = {}) =>
  useQuery({
    queryKey: ['admin', 'users', q],
    queryFn: () => page<AdminUserRow>('/api/admin/users', q),
  });

export const useAdminGenerations = (q: { q?: string; status?: string } = {}) =>
  useQuery({
    queryKey: ['admin', 'generations', q],
    queryFn: () => page<AdminGenerationRow>('/api/admin/generations', q),
    refetchInterval: 20_000,
  });

// ───────────────────────── 变更 ─────────────────────────

/**
 * 后台的写操作都长一个样：打一个请求，然后让某一族 queryKey 失效。
 * 统一在这里处理，页面里就不必各自记得该刷哪些缓存。
 */
function useAdminMutation<TInput>(
  fn: (input: TInput) => Promise<unknown>,
  invalidate: string[][],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const usePatchExplore = () =>
  useAdminMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/api/admin/explore/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    // 一并刷公开的探索广场：后台发布后它必须立刻能看到
    [['admin', 'explore'], ['admin', 'stats'], ['explore']],
  );

export const useCreateExplore = () =>
  useAdminMutation(
    (body: Record<string, unknown>) =>
      apiFetch('/api/admin/explore', { method: 'POST', body: JSON.stringify(body) }),
    // 一并刷公开的探索广场：后台发布后它必须立刻能看到
    [['admin', 'explore'], ['admin', 'stats'], ['explore']],
  );

export const useDeleteExplore = () =>
  useAdminMutation(
    (id: string) => apiFetch(`/api/admin/explore/${id}`, { method: 'DELETE' }),
    // 一并刷公开的探索广场：后台发布后它必须立刻能看到
    [['admin', 'explore'], ['admin', 'stats'], ['explore']],
  );

export const usePatchModel = () =>
  useAdminMutation(
    (body: Record<string, unknown>) =>
      apiFetch('/api/admin/models', { method: 'PATCH', body: JSON.stringify(body) }),
    // 模型开关会同时影响生成器下拉框（['models']）和后台表
    [['admin', 'models'], ['models']],
  );

export const usePatchStyle = () =>
  useAdminMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/api/admin/styles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    [['admin', 'styles'], ['styles']],
  );

export const usePatchPrompt = () =>
  useAdminMutation(
    ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/api/admin/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    [['admin', 'prompts'], ['prompts']],
  );

export const useGrantCredits = () =>
  useAdminMutation(
    ({ userId, ...body }: { userId: string; amount: number; reason: string }) =>
      apiFetch<{ balance: number }>(`/api/admin/users/${userId}/credits`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    [['admin', 'users'], ['admin', 'stats']],
  );

export const useRetryGeneration = () =>
  useAdminMutation(
    (id: string) => apiFetch(`/api/admin/generations/${id}/retry`, { method: 'POST' }),
    [['admin', 'generations'], ['admin', 'stats']],
  );
