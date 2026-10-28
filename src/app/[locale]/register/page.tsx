import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { env } from '@/server/env';
import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/auth/register-form';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return buildMetadata({
    locale,
    path: '/register',
    title: t('registerTitle'),
    description: t('registerSubtitle', { credits: env.SIGNUP_BONUS_CREDITS }),
  });
}

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user) redirect(`/${locale}/account`);

  const t = await getTranslations('auth');

  return (
    <AuthShell
      title={t('registerTitle')}
      subtitle={t('terms')}
    >
      <RegisterForm bonus={env.SIGNUP_BONUS_CREDITS} />
    </AuthShell>
  );
}
