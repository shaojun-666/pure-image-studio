'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAdminUsers, useGrantCredits, type AdminUserRow } from '@/lib/hooks/use-admin';
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

function GrantDialog({ user, onClose }: { user: AdminUserRow | null; onClose: () => void }) {
  const t = useTranslations('admin');
  const grant = useGrantCredits();
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');

  // 每次换人都重置：留着上一个人的理由是最容易发错钱的方式
  React.useEffect(() => {
    if (user) {
      setAmount('');
      setReason('');
    }
  }, [user]);

  const n = Number(amount);
  const valid = Number.isInteger(n) && n !== 0 && reason.trim().length > 0;

  const submit = () => {
    if (!user || !valid) return;
    grant.mutate(
      { userId: user.id, amount: n, reason: reason.trim() },
      { onSuccess: onClose },
    );
  };

  // grantTitle 是带 {email} 占位符的 ICU 串，值必须传进去；
  // 弹窗是常挂载的（靠 open 控制显隐），所以没人时给空串，别让 t() 在空档期抛错
  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      title={user ? t('users.grantTitle', { email: user.email }) : ''}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="grant-amount">{t('users.amount')}</Label>
          <Input
            id="grant-amount"
            type="number"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
          />
          <p className="text-xs text-muted-foreground">{t('users.amountHint')}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="grant-reason">{t('users.reason')}</Label>
          <Textarea
            id="grant-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('users.reasonPlaceholder')}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!valid || grant.isPending} onClick={submit}>
            {grant.isPending ? t('common.saving') : t('users.submit')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function AdminUsers() {
  const t = useTranslations('admin');
  const tr = useTranslations('admin.role');
  const tu = useTranslations('admin.userStatus');

  const [q, setQ] = React.useState('');
  const [role, setRole] = React.useState('');
  const [target, setTarget] = React.useState<AdminUserRow | null>(null);
  const { data, isPending } = useAdminUsers({ q, role });

  const rows = data?.items ?? [];

  return (
    <AdminPage
      title={t('users.title')}
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={role}
            onChange={setRole}
            options={[
              { value: '', label: t('users.role') },
              { value: 'USER', label: tr('USER') },
              { value: 'ADMIN', label: tr('ADMIN') },
            ]}
            className="w-28"
          />
          <AdminSearch
            value={q}
            onChange={setQ}
            placeholder={t('users.searchPlaceholder')}
            className="w-56"
          />
        </div>
      }
    >
      {isPending ? (
        <AdminLoading />
      ) : rows.length === 0 ? (
        <AdminEmpty text={t('users.empty')} />
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <Th>{t('users.email')}</Th>
              <Th className="w-24">{t('users.role')}</Th>
              <Th className="w-24">{t('users.status')}</Th>
              <Th className="w-24 text-right">{t('users.balance')}</Th>
              <Th className="w-24 text-right">{t('users.generations')}</Th>
              <Th className="w-40">{t('users.createdAt')}</Th>
              <Th className="w-40">{t('users.lastLoginAt')}</Th>
              <Th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <Td>
                  <p className="max-w-[16rem] truncate font-medium">{u.email}</p>
                  {u.name ? (
                    <p className="truncate text-xs text-muted-foreground">{u.name}</p>
                  ) : null}
                </Td>
                <Td>
                  <StatusBadge value={u.role} label={tr(u.role)} />
                </Td>
                <Td>
                  <StatusBadge value={u.status} label={tu(u.status as never)} />
                </Td>
                <Td className="text-right font-medium tabular-nums">{u.creditBalance}</Td>
                <Td className="text-right tabular-nums text-muted-foreground">
                  {u.generationCount}
                </Td>
                <Td>
                  <AdminTime iso={u.createdAt} />
                </Td>
                <Td>
                  <AdminTime iso={u.lastLoginAt} />
                </Td>
                <Td>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setTarget(u)}>
                      {t('users.grant')}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}

      <GrantDialog user={target} onClose={() => setTarget(null)} />
    </AdminPage>
  );
}
