'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { pickI18n } from '@/lib/i18n';
import { useAdminModels, usePatchModel } from '@/lib/hooks/use-admin';
import {
  AdminEmpty,
  AdminLoading,
  AdminPage,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-ui';

export function AdminModels() {
  const t = useTranslations('admin');
  const tm = useTranslations('generator.modes');
  const locale = useLocale();
  const { data, isPending } = useAdminModels();
  const patch = usePatchModel();

  // 价格覆盖允许中途乱输（比如只敲了个负号），所以本地存字符串，
  // 失焦时才解析成数字提交；空串的语义是「清掉覆盖」
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  if (isPending || !data) {
    return (
      <AdminPage title={t('models.title')} hint={t('models.hint')}>
        <AdminLoading />
      </AdminPage>
    );
  }

  if (data.length === 0) {
    return (
      <AdminPage title={t('models.title')} hint={t('models.hint')}>
        <AdminEmpty text={t('common.empty')} />
      </AdminPage>
    );
  }

  const commitOverride = (id: string, raw: string) => {
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isInteger(value) || value < 0)) return;
    patch.mutate({ id, creditCostOverride: value });
  };

  return (
    <AdminPage title={t('models.title')} hint={t('models.hint')}>
      <AdminTable>
        <thead>
          <tr>
            <Th className="w-56">{t('models.title')}</Th>
            <Th className="w-24">{t('models.tier')}</Th>
            <Th className="w-24">{t('models.creditCost')}</Th>
            <Th className="w-36">{t('models.override')}</Th>
            <Th className="w-24">{t('models.sortOrder')}</Th>
            <Th className="w-20">{t('models.enabled')}</Th>
            <Th className="w-20">{t('models.visible')}</Th>
            <Th>{t('models.capabilities')}</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => {
            const modes = Object.entries(m.capabilities.modes)
              .filter(([, on]) => on)
              .map(([mode]) => tm(mode as never));
            return (
              <tr key={m.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap font-medium">
                      {pickI18n(m.displayName, locale)}
                    </span>
                    {m.badge ? <Badge variant="accent">{pickI18n(m.badge, locale)}</Badge> : null}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{m.id}</p>
                </Td>
                <Td className="text-muted-foreground">{m.tier}</Td>
                <Td className="tabular-nums">{m.creditCost}</Td>
                <Td>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-24"
                    placeholder={t('models.overrideHint')}
                    value={draft[m.id] ?? (m.creditCostOverride ?? '')}
                    onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                    onBlur={(e) => commitOverride(m.id, e.target.value)}
                  />
                </Td>
                <Td>
                  <Input
                    type="number"
                    className="h-8 w-20"
                    defaultValue={m.sortOrder}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isInteger(v)) patch.mutate({ id: m.id, sortOrder: v });
                    }}
                  />
                </Td>
                <Td>
                  <Switch
                    checked={m.enabled}
                    aria-label={t('models.enabled')}
                    onCheckedChange={(v) => patch.mutate({ id: m.id, enabled: v })}
                  />
                </Td>
                <Td>
                  <Switch
                    checked={m.isVisible}
                    aria-label={t('models.visible')}
                    onCheckedChange={(v) => patch.mutate({ id: m.id, isVisible: v })}
                  />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    {modes.map((label) => (
                      <Badge key={String(label)} variant="muted">
                        {label}
                      </Badge>
                    ))}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {t('models.capabilityReadonly')}
                    </span>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </AdminTable>
    </AdminPage>
  );
}
