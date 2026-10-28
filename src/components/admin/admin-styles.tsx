'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { pickI18n } from '@/lib/i18n';
import { useAdminStyles, usePatchStyle } from '@/lib/hooks/use-admin';
import {
  AdminEmpty,
  AdminLoading,
  AdminPage,
  AdminSearch,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-ui';

export function AdminStyles() {
  const t = useTranslations('admin');
  const tc = useTranslations('generator.style.categories');
  const locale = useLocale();

  const [q, setQ] = React.useState('');
  const { data, isPending } = useAdminStyles({ q });
  const patch = usePatchStyle();

  const rows = data?.items ?? [];

  return (
    <AdminPage
      title={t('styles.title')}
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
        <AdminEmpty text={t('styles.empty')} />
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <Th className="w-16">{t('explore.cover')}</Th>
              <Th>{t('styles.name')}</Th>
              <Th className="w-32">{t('styles.category')}</Th>
              <Th className="w-28">{t('styles.owner')}</Th>
              <Th className="w-20">{t('styles.usage')}</Th>
              <Th className="w-24">{t('styles.enabled')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <Td>
                  <img src={s.thumbnailUrl} alt="" className="size-10 rounded object-cover" />
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{pickI18n(s.nameI18n, locale)}</span>
                    {s.isCurated ? (
                      <Badge variant="accent">{t('styles.curated')}</Badge>
                    ) : null}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{s.slug}</p>
                </Td>
                <Td className="text-muted-foreground">{tc(s.category as never)}</Td>
                <Td className="text-xs text-muted-foreground">
                  {s.ownerUserId ? t('styles.userOwned') : t('styles.curated')}
                </Td>
                <Td className="tabular-nums text-muted-foreground">{s.usageCount}</Td>
                <Td>
                  <Switch
                    checked={s.enabled}
                    aria-label={t('styles.enabled')}
                    disabled={patch.isPending}
                    onCheckedChange={(v) => patch.mutate({ id: s.id, enabled: v })}
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
