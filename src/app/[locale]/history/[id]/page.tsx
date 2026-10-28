import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@/server/auth';
import { HistoryDetail } from '@/components/history/history-detail';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  return (
    <div className="container py-8">
      <HistoryDetail id={id} />
    </div>
  );
}
