'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { pickI18n } from '@/lib/i18n';
import {
  useAdminExplore,
  useDeleteExplore,
  usePatchExplore,
} from '@/lib/hooks/use-admin';
import {
  AdminEmpty,
  AdminLoading,
  AdminPage,
  AdminSearch,
  AdminTable,
  StatusBadge,
  Td,
  Th,
} from '@/components/admin/admin-ui';

export function AdminExplore() {
  const t = useTranslations('admin');
  const ts = useTranslations('admin.status');
  const locale = useLocale();

  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('');
  const { data, isPending } = useAdminExplore({ q, status });
  const patch = usePatchExplore();
  const remove = useDeleteExplore();

  const rows = data?.items ?? [];

  return (
    <AdminPage
      title={t('explore.title')}
      hint={t('explore.hint')}
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: t('explore.status') },
              { value: 'DRAFT', label: ts('DRAFT') },
              { value: 'PUBLISHED', label: ts('PUBLISHED') },
              { value: 'ARCHIVED', label: ts('ARCHIVED') },
            ]}
            className="w-32"
          />
          <AdminSearch
            value={q}
            onChange={setQ}
            placeholder={t('explore.searchPlaceholder')}
            className="w-56"
          />
        </div>
      }
    >
      {isPending ? (
        <AdminLoading />
      ) : rows.length === 0 ? (
        <AdminEmpty text={t('explore.empty')} />
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <Th className="w-20">{t('explore.cover')}</Th>
              <Th>{t('explore.slug')}</Th>
              <Th>{t('explore.category')}</Th>
              <Th className="w-24">{t('explore.status')}</Th>
              <Th className="w-20">{t('explore.featured')}</Th>
              <Th className="w-20">{t('explore.sortOrder')}</Th>
              <Th>{t('models.title')}</Th>
              <Th className="w-40" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td>
                  <img src={p.coverUrl} alt="" className="h-10 w-16 rounded object-cover" />
                </Td>
                <Td>
                  <p className="font-medium">{pickI18n(p.titleI18n, locale)}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.slug}</p>
                </Td>
                <Td className="text-muted-foreground">{p.category ?? '—'}</Td>
                <Td>
                  <StatusBadge value={p.status} label={ts(p.status)} />
                </Td>
                <Td>
                  {p.featured ? (
                    <Badge variant="accent">{t('explore.featured')}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>
                <Td className="tabular-nums text-muted-foreground">{p.sortOrder}</Td>
                <Td className="font-mono text-xs text-muted-foreground">{p.modelId ?? '—'}</Td>
                <Td>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant={p.status === 'PUBLISHED' ? 'outline' : 'default'}
                      disabled={patch.isPending}
                      onClick={() =>
                        patch.mutate({
                          id: p.id,
                          status: p.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED',
                        })
                      }
                    >
                      {p.status === 'PUBLISHED' ? t('explore.unpublish') : t('explore.publish')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={patch.isPending}
                      onClick={() => patch.mutate({ id: p.id, featured: !p.featured })}
                    >
                      {t('explore.featured')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(t('common.confirmDelete'))) remove.mutate(p.id);
                      }}
                    >
                      {t('common.delete')}
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
