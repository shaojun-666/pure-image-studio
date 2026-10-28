import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * standalone 只服务容器 —— runner 阶段靠它把 traced 依赖拷进镜像。
   * 但这一步要建 symlink，Windows 上非管理员进程会 EPERM，本机 pnpm build
   * 因此永远卡在最后一步跑不完，也就没法用 `next start` 预览生产速度。
   * 所以挂到环境变量后面由 Dockerfile 显式打开；本机不传就不产 standalone。
   * 漏传的后果是 docker build 在 COPY .next/standalone 处直接失败，不会出坏镜像。
   */
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  // 压缩交给 Nginx：应用侧省一份 CPU
  compress: false,
  // 原生模块 / 带自己 require 逻辑的包，不能被 Next 打包
  serverExternalPackages: ['sharp', '@prisma/client', 'ali-oss', 'bcryptjs'],
  // standalone 的静态追踪抓不到 prisma 的引擎文件，显式带上
  outputFileTracingIncludes: {
    '/**': ['./node_modules/.prisma/client/**'],
  },
  /**
   * 验收脚本要同时跑两个 dev 实例（一个正常、一个注入 MOCK_FAILURE_RATE），
   * 两个进程共用一个 .next 会互相踩编译产物。留一个环境变量让它们各自用一份目录，
   * 不设时仍是默认的 .next，生产路径不受影响。
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default withNextIntl(nextConfig);
