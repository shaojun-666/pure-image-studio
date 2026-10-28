import { z } from 'zod';

/** "true"/"false" 字符串 → boolean（z.coerce.boolean 会把 "false" 当成 true） */
const bool = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true');

const num = (def: number) => z.coerce.number().default(def);

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // ── 站点 ──
  NEXT_PUBLIC_SITE_URL: z.string().default('http://localhost:3000'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().default('zh'),

  // ── 数据库 ──
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 必填'),

  // ── 认证 ──
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET 至少 16 位'),
  AUTH_URL: z.string().optional(),
  AUTH_TRUST_HOST: bool(true),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),

  // ── 存储 ──
  STORAGE_DRIVER: z.enum(['local', 'oss']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('.data/storage'),
  CDN_BASE_URL: z.string().default('http://localhost:3000/api/files'),
  OSS_REGION: z.string().optional(),
  OSS_BUCKET: z.string().optional(),
  OSS_ENDPOINT: z.string().optional(),
  OSS_ENDPOINT_INTERNAL: z.string().optional(),
  OSS_USE_INTERNAL: bool(false),
  OSS_ACCESS_KEY_ID: z.string().optional(),
  OSS_ACCESS_KEY_SECRET: z.string().optional(),

  // ── Provider ──
  /** 火山引擎方舟。留空则该厂商的模型不进模型目录 */
  ARK_API_KEY: z.string().optional(),
  DASHSCOPE_API_KEY: z.string().optional(),
  /** ofox.ai 中转站（OpenAI 兼容 /v1）。留空则该厂商的模型不进模型目录 */
  OFOX_API_KEY: z.string().optional(),
  MOCK_LATENCY_MS: num(1800),
  MOCK_ASYNC: bool(false),
  MOCK_FAILURE_RATE: num(0),
  MOCK_TIMEOUT_RATE: num(0),
  PROVIDER_TIMEOUT_MS: num(120_000),
  GENERATION_DEADLINE_MS: num(900_000),
  POLL_INTERVAL_MS: num(3000),

  // ── Worker / 积分 ──
  WORKER_ENABLED: bool(true),
  WORKER_CONCURRENCY: num(3),
  LEASE_TTL_MS: num(180_000),
  DAILY_FREE_CREDITS: num(20),
  SIGNUP_BONUS_CREDITS: num(30),
  RATE_LIMIT_GENERATIONS_PER_5MIN: num(10),

  // ── 运维 ──
  /** 默认值仅供本地开发；生产必须显式设置，见 load() 里的兜底校验 */
  CRON_SECRET: z.string().default('dev-cron-secret'),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`环境变量校验失败：\n${issues}`);
  }
  /**
   * ★ 生产不能是默认的 CRON_SECRET。
   *
   * /api/internal/cron/reconcile 是**无鉴权**的全量对账入口，只靠这个头拦：
   * 串一旦是公开的 'dev-cron-secret'，任何人都能反复触发全量对账（重活 + 抢行锁）。
   * docker-compose.yml 里已经是 ${CRON_SECRET:?必须设置}，这里补的是
   * 绕过 compose、直接 `pnpm start` 跑生产的那条路。
   * 用哨兵值判断而不是改成必填，是为了不打扰本地开发（.env.example 就是默认值）。
   *
   * ★ 只在**运行时**拦，构建期必须放行：`next build` 也会把 NODE_ENV 置为 production，
   *   但那是「收集页面数据」而不是「对外服务」，构建产物里也不该固化一个密钥。
   *   拦在构建期只会让本地 `pnpm build` 无谓地失败（本地 .env 就带着开发默认值）。
   */
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
  if (
    !isBuild &&
    parsed.data.NODE_ENV === 'production' &&
    parsed.data.CRON_SECRET === 'dev-cron-secret'
  ) {
    throw new Error(
      '环境变量校验失败：\n  - CRON_SECRET: 生产环境不能使用默认值，请设置（openssl rand -hex 24）',
    );
  }
  return parsed.data;
}

/** 启动即校验，而不是等到首次请求才炸 */
export const env = load();
export type Env = typeof env;
