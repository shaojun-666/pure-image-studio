'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function LoginForm({ showGithub }: { showGithub: boolean }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const res = await signIn('credentials', { email, password, redirect: false });

    if (!res || res.error) {
      setError(t('invalidCredentials'));
      setPending(false);
      return;
    }

    // refresh 让服务端组件（布局里的 CreditBadge / UserMenu）重新读取会话
    router.replace('/account');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder={t('passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t('loggingIn') : t('login')}
      </Button>

      {showGithub ? (
        <>
          <div className="relative py-1 text-center">
            <span className="relative z-10 bg-transparent px-3 text-xs text-muted-foreground">
              {t('or')}
            </span>
            <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => signIn('github', { callbackUrl: `/${locale}/account` })}
          >
            {t('withGithub')}
          </Button>
        </>
      ) : null}

      <p className="text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          {t('goRegister')}
        </Link>
      </p>
    </form>
  );
}
