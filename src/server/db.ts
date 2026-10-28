import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env';

// Prisma 7 起运行时连接由 driver adapter 提供，不再从 schema 的 datasource.url 读取
function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

// 开发环境热重载会重复求值模块，缓存到 globalThis 避免连接数爆炸
export const prisma = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
