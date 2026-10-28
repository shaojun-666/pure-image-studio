'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

type RegisteredUser = { id: string; email: string; name: string | null; creditBalance: number };

export function RegisterForm({ bonus }: { bonus: number }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password.length < 8) return setError(t('passwordTooShort'));
    setPending(true);

    try {
      await apiFetch<RegisteredUser>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name.trim() || undefined,
          locale,
        }),
      });
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.code === 'CONFLICT'
          ? t('emailTaken')
          : t('networkError'),
      );
      setPending(false);
      return;
    }

    // 注册成功后直接登录，用户不需要再输一次密码
    const res = await signIn('credentials', {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    if (!res || res.error) {
      // 极小概率：注册成功但登录失败。送到登录页而不是卡在这里。
      router.replace('/login');
      return;
    }

    router.replace('/account');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">{t('name')}</Label>
        <Input
          id="name"
          autoComplete="nickname"
          maxLength={40}
          placeholder={t('namePlaceholder')}
          value={form.name}
          onChange={set('name')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t('emailPlaceholder')}
          value={form.email}
          onChange={set('email')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder={t('passwordPlaceholder')}
          value={form.password}
          onChange={set('password')}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t('registering') : t('register')}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {t('registerSubtitle', { credits: bonus })}
      </p>

      <p className="text-center text-sm text-muted-foreground">
        {t('hasAccount')}{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('goLogin')}
        </Link>
      </p>
    </form>
  );
}
