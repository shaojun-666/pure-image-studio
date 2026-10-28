import './load-env';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedModels } from './models';
import { seedStyles } from './styles';
import { seedPrompts } from './prompts';
import { seedExplore } from './explore';
import { seedAdmin } from './admin';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL 未设置，无法执行 seed');

// seed 自带客户端：不 import @/server/env，避免因为 AUTH_SECRET 之类缺失而炸掉
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  console.log('▸ 开始写入种子数据');
  await seedModels(prisma);
  await seedStyles(prisma);
  await seedPrompts(prisma);
  await seedExplore(prisma);
  await seedAdmin(prisma);
  console.log('▸ 完成');
}

main()
  .catch((e) => {
    console.error('✗ seed 失败：', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
