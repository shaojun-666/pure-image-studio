/**
 * 必须是 seed 入口的**第一个** import。
 *
 * `pnpm db:seed` 直接跑 tsx，没有谁预加载 .env；而 ESM 会先把整条 import 链求值完
 * 才执行本模块的顶层语句。`./models` 会经 `src/server/providers` 拉到 `src/server/env`，
 * 那边一校验 DATABASE_URL / AUTH_SECRET 发现是空的就直接抛错。
 * 所以加载 .env 这件事只能放在一个更早的模块里，不能写在入口的顶层。
 */
try {
  process.loadEnvFile('.env');
} catch {
  // 生产环境由容器注入，没有 .env 是正常的
}
