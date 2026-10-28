'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { pickI18n } from '@/lib/i18n';
import { useAdminPrompts, usePatchPrompt } from '@/lib/hooks/use-admin';
import {
  AdminEmpty,
  AdminLoading,
  AdminPage,
  AdminSearch,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-ui';

export function AdminPrompts() {
  const t = useTranslations('admin');
  const locale = useLocale();

  const [q, setQ] = React.useState('');
  const { data, isPending } = useAdminPrompts({ q });
  const patch = usePatchPrompt();

  const rows = data?.items ?? [];

  return (
    <AdminPage
      title={t('prompts.title')}
      actions={
        <AdminSearch
          value={q}
          onChange={setQ}
          placeholder={t('common.search')}
          className="w-64"
        />
      }
    >
      {isPending ? (
        <AdminLoading />
      ) : rows.length === 0 ? (
        <AdminEmpty text={t('prompts.empty')} />
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <Th>{t('prompts.name')}</Th>
              <Th className="w-32">{t('prompts.category')}</Th>
              <Th>{t('prompts.body')}</Th>
              <Th className="w-20">{t('prompts.usage')}</Th>
              <Th className="w-24">{t('prompts.enabled')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{pickI18n(p.titleI18n, locale)}</span>
                    {p.isCurated ? <Badge variant="accent">{t('styles.curated')}</Badge> : null}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{p.slug}</p>
                </Td>
                <Td className="text-muted-foreground">{p.category}</Td>
                <Td>
                  <p className="max-w-[28rem] truncate text-xs text-muted-foreground" title={p.prompt}>
                    {p.prompt}
                  </p>
                </Td>
                <Td className="tabular-nums text-muted-foreground">{p.usageCount}</Td>
                <Td>
                  <Switch
                    checked={p.enabled}
                    aria-label={t('prompts.enabled')}
                    disabled={patch.isPending}
                    onCheckedChange={(v) => patch.mutate({ id: p.id, enabled: v })}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </AdminPage>
  );
}
