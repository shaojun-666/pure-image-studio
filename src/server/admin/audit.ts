import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';

/**
 * 后台审计。每一次「改了别人的东西」都要留痕：谁、什么时候、把什么从什么样改成了什么样。
 *
 * diff 里**绝不写密码、token 这类东西**——审计日志是给运营看的，不是凭据仓库。
 */
export type AuditInput = {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  diff?: Prisma.InputJsonValue;
  ip?: string | null;
};

/**
 * 与业务改动同事务写入：传 tx 时用事务客户端。
 * 审计写失败必须让业务改动一起回滚 —— 一个改了但没人知道是谁改的后台，比没有后台更糟。
 */
export function writeAudit(tx: Prisma.TransactionClient, input: AuditInput) {
  return tx.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      diff: input.diff,
      ip: input.ip ?? null,
    },
  });
}

/** 只读查询用，不需要事务 */
export function listAudit(limit = 50) {
  return prisma.adminAuditLog.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      diff: true,
      createdAt: true,
      admin: { select: { email: true } },
    },
  });
}
