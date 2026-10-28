/**
 * 用真实模型重出样本图：风格预设的缩略图 + 探索精选的封面。
 *
 * 为什么是独立脚本而不是并进 seed：seed 必须能在没有 DASHSCOPE_API_KEY 的机器上跑出
 * 过程化 SVG 占位图，而这个脚本每跑一次都花钱。两者不能绑在一起。
 *
 * 为什么不走 /api/generate：那要注册账号、扣积分、等 worker 轮询，42 张会非常慢。
 * 这里直接调 provider.submit()，顺带把「模型 id / size 档 / 错误码」这三处存疑
 * 对着真实 API 验一遍 —— 这正是 Phase 8 剩下没做的那件事。
 *
 * 幂等：每张图带一个由 slug 派生的固定 seed，重复跑得到同一张图，不会越跑越乱。
 *
 * 用法：tsx scripts/gen-samples.ts [styles|explore|all] [slug...]
 *   后面可以跟任意个 slug，只出这几个 —— 试提示词、或补出后新增的作品时用，避免整批重跑
 */
import '../prisma/seed/load-env';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { resolveDimensions } from '../src/lib/ai/aspect';
import type { AspectRatio } from '../src/lib/ai/contracts';
import { dashscopeProvider } from '../src/server/providers/dashscope';
import { ProviderError } from '../src/server/providers/errors';

/**
 * 每个风格配一个最能体现它的题材。
 *
 * 上一版所有风格共用同一个灯塔题材，结果是废的：题材描述太长，把风格后缀彻底淹没，
 * 30 张出了一堆同一个调子的插画（「16 位像素」出来的根本不是像素画）；而且
 * 角色设定表 / 分镜草图 / 产品图 这些风格跟灯塔题材本来就对不上。
 * 现在改成风格词在前、题材在后，且题材按风格挑。题材之间还必须互不重复 ——
 * 两处山景、两只狐狸这种，用户扫一眼就知道是同一批糊弄出来的。
 */
const SUBJECTS: Record<string, string> = {
  'anime-cel': 'a girl in a school uniform on a rooftop at sunset, upper body, looking back',
  // 原本是「机甲驾驶舱里的飞行员」，加了 anime-mecha 之后题材会撞，换成 90 年代 OVA 的飞行冒险构图
  'anime-90s': 'a girl in a flight suit standing on the deck of an airship at sunrise',
  'anime-handpaint': 'a boy and a girl running through a field of tall grass toward distant hills',
  'anime-shoujo': 'a girl with long flowing hair surrounded by rose petals, holding a letter',
  'anime-chibi': 'a chibi cat chef holding a wooden spoon bigger than itself',
  'anime-webtoon': 'a young office worker in a modern cafe looking at a phone',
  'anime-mecha': 'a towering humanoid mecha kneeling in a flooded city street',
  'anime-sky': 'a city skyline seen from a hilltop under a vast dramatic sunset sky',
  'anime-ukiyoe': 'a great wave with fishing boats and a distant snow-capped peak',
  'photo-real': 'close-up portrait of an older fisherman with a weathered face',
  cinematic: 'a lone figure walking a rain-soaked street at night',
  'pixar-3d': 'a cheerful young explorer character with a backpack',
  'octane-3d': 'a chrome motorcycle helmet on a dark reflective surface',
  'flat-vector': 'a hot air balloon drifting over rolling hills',
  'children-book': 'a small bear and a rabbit having a picnic',
  'oil-classic': 'a still life of fruit, bread and a brass pitcher on a dark table',
  impressionist: 'a sunlit garden path with poppies',
  'cyberpunk-neon': 'a narrow city alley at night in the rain',
  biomech: 'a biomechanical android torso',
  'chinese-ink': 'misty karst mountains reflected in a still river',
  gongbi: 'a red-crowned crane among peony blossoms',
  'watercolor-soft': 'a quiet village lane with a bicycle and laundry lines after rain',
  gouache: 'a flower stall at a busy morning market',
  'pixel-16': 'a knight with a sword in front of a castle gate',
  'isometric-pixel': 'a tiny cozy house with a garden and a path',
  'film-portrait': 'close-up portrait of a woman with freckles by a window',
  'product-studio': 'a glass perfume bottle on a seamless backdrop',
  'concept-env': 'a colossal ancient ruin in a desert valley with a tiny explorer',
  'character-sheet': 'a robot butler character shown from three angles',
  'lineart-clean': 'a lighthouse on a rocky cliff',
  storyboard: 'two people arguing across a table',
  claymation: 'a small fox standing on a miniature hill',
  lowpoly: 'a sailing ship on a low-poly ocean',
  'poster-swiss': 'a steam locomotive reduced to geometric shapes',
  'vintage-poster': 'a seaside pier with a ferris wheel at dusk',
  'paper-cut': 'a forest clearing with a deer and trees',
  'stained-glass': 'a peacock with a fanned tail',
};

/** 兜底模型：风格预设表没有 modelId 字段，一律用它 */
const MODEL_ID = 'qwen-image-3';
/** 百炼对这个账号的 QPS 卡得很紧，并发 3 就整批撞 429，所以老实串行 */
const CONCURRENCY = 1;
const STYLE_THUMB_SIZE = 512;

/**
 * 模型按 id 现查，不再全局绑一个 —— 探索作品各自在 DB 里记了 modelId，
 * 同一个广场里混着免费额度的 z-image-turbo 和付费的 qwen-image-3。
 * 封面出自哪个模型必须与 DB 里那条记录一致，否则详情页「一键同款」会换成另一个模型出图。
 */
type Model = (typeof dashscopeProvider.models)[number];
const modelCache = new Map<string, Model>();
function modelOf(id: string): Model {
  let m = modelCache.get(id);
  if (!m) {
    m = dashscopeProvider.models.find((x) => x.id === id);
    if (!m) throw new Error(`模型 ${id} 不在 provider 目录里`);
    modelCache.set(id, m);
  }
  return m;
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL 未设置');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

/** slug → 稳定的十进制 seed。同一个 slug 永远得到同一张图。 */
function seedOf(slug: string): string {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = ((h ^ slug.charCodeAt(i)) * 16777619) >>> 0;
  return String(h % 1_000_000_000);
}

async function render(prompt: string, seed: string, modelId: string): Promise<Buffer> {
  const res = await dashscopeProvider.submit(
    {
      mode: 'textToImage',
      prompt,
      aspectRatio: '1:1',
      resolution: '1K',
      batchCount: 1,
      seed,
    },
    {
      signal: AbortSignal.timeout(120_000),
      model: modelOf(modelId),
      requestId: `seed-sample:${seed}`,
      userId: 'seed',
      logger: console,
    },
  );
  if (res.kind !== 'sync') throw new Error('样本图只支持同步出图');
  const first = res.images[0];
  if (!first?.data?.length) throw new Error('厂商返回了空图');
  return Buffer.from(first.data);
}

type Job = {
  slug: string;
  prompt: string;
  seed: string;
  /** 这张图用哪个模型出，取自 DB 里那条记录 */
  modelId: string;
  dest: string;
  width: number;
  height: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 撞到限流就退避重试 —— 串行跑完 42 张要好几分钟，被一次 429 全扔掉太可惜。 */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ProviderError) || !e.retryable || attempt >= tries) throw e;
      const wait = 2000 * 2 ** (attempt - 1);
      console.log(`  … ${e.message.slice(0, 50)} —— ${wait / 1000}s 后重试`);
      await sleep(wait);
    }
  }
}

/** 固定并发跑。不可重试的失败就整体停下 —— 免得配置写错时白烧 42 次调用。 */
async function run(jobs: Job[]) {
  let done = 0;
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (job) => {
        const png = await withRetry(() => render(job.prompt, job.seed, job.modelId));
        await sharp(png)
          .resize(job.width, job.height, { fit: 'cover' })
          .webp({ quality: 88 })
          .toFile(job.dest);
        done++;
        console.log(`  ✓ [${done}/${jobs.length}] ${job.slug}`);
      }),
    );
  }
}

async function styleJobs(root: string): Promise<Job[]> {
  const dir = path.join(root, 'public', 'styles');
  await mkdir(dir, { recursive: true });
  const rows = await prisma.stylePreset.findMany({
    where: { isCurated: true },
    select: { slug: true, promptSuffix: true },
    orderBy: { sortOrder: 'asc' },
  });
  return rows.map((s) => {
    const subject = SUBJECTS[s.slug];
    if (!subject) throw new Error(`风格 ${s.slug} 没配展示题材 —— 在 SUBJECTS 里补一条`);
    return {
      slug: s.slug,
      // 风格词在前、题材在后。反过来（长题材打头）实测会被淹没成一堆同调插画。
      prompt: `${s.promptSuffix}, ${subject}`,
      seed: seedOf(s.slug),
      modelId: MODEL_ID,
      dest: path.join(dir, `${s.slug}.webp`),
      width: STYLE_THUMB_SIZE,
      height: STYLE_THUMB_SIZE,
    };
  });
}

async function exploreJobs(root: string): Promise<Job[]> {
  const dir = path.join(root, 'public', 'explore');
  await mkdir(dir, { recursive: true });
  const rows = await prisma.explorePost.findMany({
    select: { slug: true, prompt: true, params: true, modelId: true },
    orderBy: { sortOrder: 'asc' },
  });
  return rows.map((p) => {
    const params = p.params as { aspectRatio?: string; seed?: string } | null;
    const aspect = (params?.aspectRatio ?? '1:1') as AspectRatio;
    const { width, height } = resolveDimensions(aspect, '1K');
    return {
      slug: p.slug,
      // 探索的 prompt 本来就是精心写的完整描述，不再拼统一主体
      prompt: p.prompt,
      // ★ 必须用 DB 里存的那个 seed：详情页「一键同款」回填的就是它。
      //   这里若改用 slug 派生值，用户点「同款」会拿到另一张图，封面就成了摆设。
      seed: params?.seed ?? seedOf(p.slug),
      modelId: p.modelId ?? MODEL_ID,
      dest: path.join(dir, `${p.slug}.webp`),
      width,
      height,
    };
  });
}

async function main() {
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error('DASHSCOPE_API_KEY 未配置 —— 在 .env 里加一行再跑');
  }
  if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local') {
    throw new Error('这个脚本只写本地磁盘，STORAGE_DRIVER 非 local 时请改用对象存储上传');
  }

  const which = (process.argv[2] ?? 'all') as 'styles' | 'explore' | 'all';
  const root = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_ROOT ?? '.data/storage');

  const only = process.argv.slice(3);

  if (which === 'styles' || which === 'all') {
    let jobs = await styleJobs(root);
    if (only.length) jobs = jobs.filter((j) => only.includes(j.slug));
    if (!jobs.length) throw new Error(`没有匹配的风格：${only.join(', ')}`);
    console.log(`▸ 风格缩略图 ${jobs.length} 张 → public/styles/`);
    await run(jobs);
  }
  if (which === 'explore' || which === 'all') {
    let jobs = await exploreJobs(root);
    if (only.length) jobs = jobs.filter((j) => only.includes(j.slug));
    if (!jobs.length) throw new Error(`没有匹配的作品：${only.join(', ')}`);
    console.log(`▸ 探索封面 ${jobs.length} 张 → public/explore/`);
    await run(jobs);
  }
  console.log('▸ 完成');
}

main()
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
