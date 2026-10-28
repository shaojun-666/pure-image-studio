# syntax=docker/dockerfile:1
#
# 三阶段构建。★ 用 Debian 而不是 Alpine：musl 下 sharp/libvips 要重编译，
# 坑多且慢；bookworm-slim 直接吃 sharp 的预编译产物。
#
# 四个 target：
#   deps    依赖（被 builder / migrate 复用）
#   builder 跑 next build
#   runner  生产镜像：只有 .next/standalone，不装 node_modules
#   migrate 一次性任务：prisma CLI + 迁移文件（也用来跑 seed）

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
# 不用 corepack：它的签名密钥轮换会让构建在某天毫无预兆地挂掉，
# 直接钉版本更省事。registry 走国内镜像，.npmrc 里那份是给下面的 pnpm install 用的。
RUN npm i -g --registry=https://registry.npmmirror.com pnpm@12.3.4
WORKDIR /app

# ── deps ── 只依赖清单，源码改动不会让这一层失效
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ── builder ──
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期要有占位值：src/server/env.ts 在模块求值时就校验，缺了会在 build 阶段抛错。
# NEXT_PUBLIC_* 会被内联进客户端产物（SEO / hreflang 用），所以那种必须是真值 —— 从 build args 来。
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_DEFAULT_LOCALE=zh
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    AUTH_SECRET=build-time-placeholder-secret \
    CRON_SECRET=build-time-placeholder-cron-secret \
    BUILD_STANDALONE=1
RUN pnpm prisma generate && pnpm build

# ── migrate ── 只带 prisma CLI 与迁移文件，不把 .next 拖进来
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
# seed 会 import src/server/providers 读模型目录，所以 src 和 tsconfig（tsx 靠它解析路径别名）都得带上
COPY tsconfig.json ./
COPY src ./src
# ★ 必须 generate：这个 target 也用来跑 seed，而 seed 要走 @prisma/client，缺了
#   会在启动时报 MODULE_NOT_FOUND '.prisma/client/default'。generate 不连库，占位 URL 够用。
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm prisma generate
CMD ["pnpm", "prisma", "migrate", "deploy"]

# ── runner ──
FROM base AS runner
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_ROOT=/app/.data/storage
# tini：PID 1 得能转发信号，否则 compose stop 要干等 10s 才被 SIGKILL
# fontconfig + fonts-noto-cjk/emoji：mock provider 用 SVG 写字，缺字体就是豆腐块
# curl：HEALTHCHECK 用
# ★ 两个国内网络下的教训，都写在这层里：
#   1) apt 源换国内镜像，并给 http 加超时 —— 不设超时时 apt 会一直挂着等，看不出是卡住了
#   2) 用 fonts-wqy-zenhei 而不是 fonts-noto-cjk：后者单个包 56MB，实测在本机网络上
#      从 deb.debian.org 和 mirrors.aliyun.com 都拉不完（同批 9.8MB 的 emoji 字体却正常）。
#      文泉驿有完整简繁中文覆盖，mock.ts 的字族栈以 sans-serif 收尾，fontconfig 会回退到它。
#   debian.sources 是 bookworm 的新格式，两种路径都要改。
RUN set -eux; \
    for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
      if [ -f "$f" ]; then sed -i 's|deb.debian.org|mirrors.aliyun.com|g' "$f"; fi; \
    done; \
    apt-get -o Acquire::http::Timeout=30 -o Acquire::Retries=3 update \
 && apt-get -o Acquire::http::Timeout=30 -o Acquire::Retries=3 install -y --no-install-recommends \
      tini curl ca-certificates tzdata fontconfig fonts-wqy-zenhei fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*

# standalone 产物：server.js + 被追踪到的 node_modules 子集
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# 本地驱动写盘目标；用 OSS 时这个目录是空的
RUN mkdir -p /app/.data/storage && chown -R node:node /app/.data
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
