import { env } from '@/server/env';

/**
 * 只在 nodejs runtime 执行的部分 —— 靠 import 的副作用启动，不导出函数。
 * worker 与应用同进程：单容器部署下这比多开一个进程简单，
 * 扩容时再加一个 WORKER_ONLY 容器即可，代码不用重构。
 *
 * worker 只能动态 import（静态 import 会把 sharp 依赖链拉进 edge 包），
 * 而 instrumentation 的产物是 CJS，所以这里不能用顶层 await ——
 * 启动后台循环本来也不需要等它。
 */
if (env.WORKER_ENABLED) {
  void import('@/server/worker')
    .then(({ startWorker }) => startWorker())
    .catch((e) => console.error('[instrumentation] worker 启动失败', e));
}
