import { prisma } from '@/server/db';
import { fail, ok } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Docker healthcheck 打这个。数据库不通就是 503，别让编排器以为一切正常。 */
export async function GET() {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return fail('INTERNAL_ERROR', '数据库不可用', 503);
  }
  return ok({
    status: 'ok',
    db: 'up',
    dbLatencyMs: Date.now() - t0,
    uptimeSec: Math.round(process.uptime()),
  });
}
