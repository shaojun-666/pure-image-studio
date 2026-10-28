import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { env } from '@/server/env';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return buildMetadata({
    locale,
    path: '/login',
    title: t('loginTitle'),
    description: t('loginSubtitle'),
  });
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // 已登录用户不该再看到登录页
  const session = await auth();
  if (session?.user) redirect(`/${locale}/account`);

  const t = await getTranslations('auth');

  return (
    <AuthShell title={t('loginTitle')} subtitle={t('loginSubtitle')}>
      <LoginForm showGithub={Boolean(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET)} />
    </AuthShell>
  );
}
