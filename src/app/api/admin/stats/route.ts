import { requireAdmin } from '@/server/auth/guards';
import { adminStats } from '@/server/admin/stats';
import { listAudit } from '@/server/admin/audit';
import { ok, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireAdmin();
  const [stats, audit] = await Promise.all([adminStats(), listAudit(12)]);
  return ok({ ...stats, audit });
});
