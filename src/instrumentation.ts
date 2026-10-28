/**
 * Next 启动钩子。
 *
 * ★ 必须写成 `if (process.env.NEXT_RUNTIME === 'nodejs') { await import(...) }`
 *   这个形状：NEXT_RUNTIME 在编译期按 runtime 静态替换，edge 包才能整块消除掉
 *   node-only 的依赖（sharp 及其依赖链会 require('child_process')）。
 *   写成提前 return 的守卫没用，bundler 照样会把模块拉进 edge 包。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('@/instrumentation-node');
  }
}
