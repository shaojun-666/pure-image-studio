'use client';

import * as React from 'react';
import { signOut } from 'next-auth/react';
import { useFormatter, useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-catalog';
import type { MeDTO } from '@/lib/hooks/use-catalog';

/**
 * 账户设置。只暴露 `/api/me` 的 PATCH 真正支持的字段（昵称、头像、语言），
 * 邮箱与注册时间只读展示 —— 改邮箱要先做验证流程，本期不做。
 */
export function SettingsForm() {
  const t = useTranslations('account.settings');
  const format = useFormatter();
  const { data: me, isPending } = useMe();

  const [name, setName] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState(false);

  // 数据到手后填一次初值；用户开始编辑（touched）之后就不再覆盖输入框
  React.useEffect(() => {
    if (me && !touched) setName(me.name ?? '');
  }, [me, touched]);

  const save = async () => {
    setStatus('saving');
    setError(null);
    try {
      await apiFetch<MeDTO>('/api/me', { method: 'PATCH', body: JSON.stringify({ name }) });
      setStatus('saved');
      setTouched(false);
      setTimeout(() => setStatus('idle'), 1500);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('failed'));
      setStatus('idle');
    }
  };

  if (isPending) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('profile')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="account-name" className="text-sm font-medium">
              {t('name')}
            </label>
            <Input
              id="account-name"
              value={name}
              maxLength={40}
              placeholder={t('namePlaceholder')}
              onChange={(e) => {
                setTouched(true);
                setName(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">{t('nameHint')}</p>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t('email')}</span>
            <p className="rounded-lg border border-input bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              {me?.email}
            </p>
            <p className="text-xs text-muted-foreground">{t('emailHint')}</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={status === 'saving' || !name.trim()}>
              {status === 'saving' ? t('saving') : t('save')}
            </Button>
            {status === 'saved' && (
              <span className="text-sm text-emerald-400">{t('saved')}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('account')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('memberSince')}</span>
            <span>
              {me ? format.dateTime(new Date(me.createdAt), { dateStyle: 'long' }) : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('role')}</span>
            <span>{t(`roles.${me?.role ?? 'USER'}` as 'roles.USER')}</span>
          </div>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => void signOut({ callbackUrl: '/' })}
          >
            <LogOut />
            {t('signOut')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
