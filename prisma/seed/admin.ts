import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/server/auth/password';

const ADMIN_CREDITS = 1000;

/**
 * 管理员没有第二条创建路径（后台入口本身要求 admin），所以由 seed 提供。
 * 未设置 SEED_ADMIN_* 时静默跳过——本地开发不需要。
 */
export async function seedAdmin(prisma: PrismaClient) {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('· 跳过管理员（未设置 SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD）');
    return;
  }
  if (password.length < 8) throw new Error('SEED_ADMIN_PASSWORD 至少 8 位');

  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await hashPassword(password);

  if (existing) {
    // 只补权限和密码，不重置已有余额
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN', status: 'ACTIVE', passwordHash },
    });
    console.log(`  ✓ 管理员已存在，已确保 ADMIN 权限：${email}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: 'Admin',
        passwordHash,
        role: 'ADMIN',
        creditBalance: ADMIN_CREDITS,
        emailVerified: new Date(),
      },
      select: { id: true },
    });

    await tx.creditLedger.create({
      data: {
        userId: user.id,
        kind: 'ADMIN_GRANT',
        delta: ADMIN_CREDITS,
        balanceAfter: ADMIN_CREDITS,
        reason: 'seed 初始管理员额度',
        idempotencyKey: `admin-seed:${user.id}`,
      },
    });
  });

  console.log(`  ✓ 管理员 ${email}（+${ADMIN_CREDITS} 积分）`);
}
