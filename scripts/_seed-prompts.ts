/**
 * 只灌精选提示词，不碰 admin 密码、也不碰其它表。
 *
 * 为什么单独留一个：`pnpm db:seed` 是全量种子，里面 `seedAdmin` 在
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD 仍有值时会把管理员密码**改回 .env 里的值**
 * （见 prisma/seed/admin.ts；那两个变量没设时它静默跳过，所以全量种子也不总是危险）。
 * 只想更新提示词库、又不想赌这一把时用这个。
 *
 * 用法：pnpm exec tsx scripts/_seed-prompts.ts
 * 提示词是 upsert，可以反复跑。不需要了删掉即可。
 */
import '../prisma/seed/load-env';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedPrompts } from '../prisma/seed/prompts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL 未设置');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

seedPrompts(prisma)
  .then(async () => {
    const total = await prisma.promptPreset.count({ where: { isCurated: true } });
    const byCat = await prisma.promptPreset.groupBy({
      by: ['category'],
      where: { isCurated: true },
      _count: true,
    });
    console.log(`  库里精选提示词共 ${total} 条`);
    console.log('  ' + byCat.map((c) => `${c.category}:${c._count}`).join(' '));
  })
  .catch((e) => {
    console.error('✗ 失败：', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
