import { errors } from '@/types/api';
import { auth } from './index';

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: 'USER' | 'ADMIN';
};

/** 未登录直接抛 401，由 route() 包装统一翻译 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) throw errors.unauthorized();
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    role: session.user.role ?? 'USER',
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw errors.forbidden('需要管理员权限');
  return user;
}
