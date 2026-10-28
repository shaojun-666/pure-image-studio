import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AdminExplore } from '@/components/admin/admin-explore';

export const metadata: Metadata = {
  // 后台不进搜索引擎：robots.txt 已屏蔽，这里再加一道 meta
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminExplore />;
}
