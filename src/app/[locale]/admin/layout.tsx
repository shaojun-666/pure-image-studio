import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@/server/auth';
import { AdminNav } from '@/components/admin/admin-nav';

/**
 * 后台区的鉴权。守卫放在 layout，七个子页就不必各自判一次。
 *
 * 未登录去登录页，已登录但不是管理员回首页 ——
 * 对非管理员暴露「这里有个后台」本身就没必要。
 */
export default async function AdminLayout({
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
  if (session.user.role !== 'ADMIN') redirect(`/${locale}`);

  return (
    <div className="container py-10">
      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
