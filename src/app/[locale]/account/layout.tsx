import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@/server/auth';
import { AccountNav } from '@/components/account/account-nav';

/**
 * 账户区的鉴权与骨架。放在 layout 里，四个子页就都不必各自判一次登录。
 *
 * 每日额度不在这里领：概览页要读「本次是否发放」来决定那句文案，
 * 领取动作放到 layout 会让子页永远读到「已领过」。
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  return (
    <div className="container py-10">
      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
