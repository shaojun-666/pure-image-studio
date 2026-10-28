'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useAdminGenerations, useRetryGeneration } from '@/lib/hooks/use-admin';
import {
  AdminEmpty,
  AdminLoading,
  AdminPage,
  AdminSearch,
  AdminTable,
  AdminTime,
  StatusBadge,
  Td,
  Th,
} from '@/components/admin/admin-ui';

export function AdminGenerations() {
  const t = useTranslations('admin');
  const ts = useTranslations('admin.status');

  const [q, setQ] = React.useState('');
  // 默认只看失败：这个页面的用途是排查，不是浏览
  const [status, setStatus] = React.useState('FAILED');
  const { data, isPending } = useAdminGenerations({ q, status });
  const retry = useRetryGeneration();

  const rows = data?.items ?? [];

  return (
    <AdminPage
      title={t('generations.title')}
      hint={t('generations.hint')}
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: t('generations.status') },
              { value: 'FAILED', label: ts('FAILED') },
              { value: 'PARTIAL', label: ts('PARTIAL') },
              { value: 'RUNNING', label: ts('RUNNING') },
              { value: 'PENDING', label: ts('PENDING') },
              { value: 'SUCCEEDED', label: ts('SUCCEEDED') },
              { value: 'CANCELED', label: ts('CANCELED') },
            ]}
            className="w-32"
          />
          <AdminSearch
            value={q}
            onChange={setQ}
            placeholder={t('generations.searchPlaceholder')}
            className="w-56"
          />
        </div>
      }
    >
      {isPending ? (
        <AdminLoading />
      ) : rows.length === 0 ? (
        <AdminEmpty text={t('generations.empty')} />
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <Th className="w-24">{t('generations.status')}</Th>
              <Th className="w-32">{t('generations.mode')}</Th>
              <Th className="w-28">{t('generations.model')}</Th>
              <Th>{t('generations.prompt')}</Th>
              <Th>{t('generations.error')}</Th>
              <Th className="w-28">{t('generations.credits')}</Th>
              <Th className="w-16">{t('generations.attempts')}</Th>
              <Th className="w-40">{t('generations.createdAt')}</Th>
              <Th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <Td>
                  <StatusBadge value={g.status} label={ts(g.status as never)} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {g.succeededCount}/{g.batchCount}
                  </p>
                </Td>
                <Td className="text-muted-foreground">{g.mode}</Td>
                <Td className="font-mono text-xs">{g.modelId}</Td>
                <Td>
                  <p className="max-w-[20rem] truncate text-xs" title={g.prompt}>
                    {g.prompt}
                  </p>
                  <p className="max-w-[16rem] truncate text-xs text-muted-foreground">{g.email}</p>
                </Td>
                <Td>
                  {g.errorCode ? (
                    <span className="font-mono text-xs text-destructive" title={g.errorMessage ?? ''}>
                      {g.errorCode}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs tabular-nums">
                  <span title={t('generations.creditsHint')}>
                    {g.creditsSpent} / {g.creditsHeld}
                    {g.creditsRefunded > 0 ? (
                      <span className="text-muted-foreground"> +{g.creditsRefunded}</span>
                    ) : null}
                  </span>
                </Td>
                <Td className="tabular-nums text-muted-foreground">{g.attempts}</Td>
                <Td>
                  <AdminTime iso={g.createdAt} />
                </Td>
                <Td>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(g.id)}
                    >
                      {t('generations.retry')}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </AdminPage>
  );
}
