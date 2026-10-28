import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AdminDashboard } from '@/components/admin/admin-dashboard';

export const metadata: Metadata = {
  // 后台不进搜索引擎：robots.txt 已屏蔽，这里再加一道 meta
  robots: { index: false, follow: false },
};

export default async function AdminHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminDashboard />;
}
