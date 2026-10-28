import { defineConfig, env } from 'prisma/config';

// Prisma 7 不再自动加载 .env，用 Node 内置能力顶上（Node 20.6+）
try {
  process.loadEnvFile('.env');
} catch {
  // 生产环境由容器注入环境变量，没有 .env 文件是正常的
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
});
