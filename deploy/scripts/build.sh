#!/usr/bin/env bash
# 构建三个镜像（app / migrate / cron）。
#
# ★ 刻意不用 `docker compose build`：compose 的构建路径在部分环境下会因为
#   gRPC 会话头直接失败（Windows 上见过 "x-docker-expose-session-sharedkey
#   contains value with non-printable ASCII characters"）；而且 app/migrate/seed
#   共用一份 Dockerfile，显式 build 能让三个 target 复用同一份层缓存。
set -euo pipefail
cd "$(dirname "$0")/../.."

# ★ 内存预检：这台机器构建不了。
#   本机（2 核 / 1.6GiB）跑 `next build` 会把 swap 打满、**整机用户态僵死** ——
#   ICMP 正常、SSH 能建连但发不出 banner、nginx 端口 TCP 1ms 建连却几十秒零字节，
#   实测 40 分钟没构建完，最后只能从阿里云控制台强制重启，生产站点挂了约 40 分钟。
#   所以这里直接拒绝，而不是等它把机器拖死。要在这台机器上构建才用 FORCE_BUILD=1。
if [ -r /proc/meminfo ]; then
  MEM_MB=$(awk '/^MemTotal:/{printf "%d", $2/1024}' /proc/meminfo)
  MIN_MEM_MB=${MIN_BUILD_MEM_MB:-3000}
  if [ "$MEM_MB" -lt "$MIN_MEM_MB" ] && [ "${FORCE_BUILD:-0}" != "1" ]; then
    cat <<EOF
本机内存 ${MEM_MB}MB，低于构建所需的 ${MIN_MEM_MB}MB —— 拒绝在这里构建。

请改成本机构建 + 传镜像（压缩后约 300MB，实测 1 分半）：

  # 本地
  docker build --target runner  -t aigc-app:latest --build-arg NEXT_PUBLIC_SITE_URL=<站点URL> .
  docker build --target migrate -t aigc-migrate:latest .
  docker save aigc-app:latest aigc-migrate:latest | gzip -1 | ssh <user>@<host> 'gunzip | docker load'

  # 服务器（跳过构建）
  ./deploy/scripts/deploy.sh --no-build

确实要在这台机器上构建：FORCE_BUILD=1 ./deploy/scripts/build.sh
EOF
    exit 1
  fi
fi

ENV_FILE=${ENV_FILE:-.env}
if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 $ENV_FILE：照 .env.production.example 填好再跑"
  exit 1
fi

# 只取需要的两行，不去 source 整个文件（值里有空格或注释会被 shell 吃掉）。
# ★ `|| true` 不能省：键不存在时 grep 返回 1，配上 set -e + pipefail 会让整个
#   赋值语句失败并让脚本静默退出 —— 看不到任何报错，只知道「什么都没发生」。
envval() {
  grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true
}

SITE_URL=$(envval NEXT_PUBLIC_SITE_URL)
if [ -z "$SITE_URL" ]; then
  echo "$ENV_FILE 里没有 NEXT_PUBLIC_SITE_URL"
  exit 1
fi

ARGS=(--build-arg "NEXT_PUBLIC_SITE_URL=$SITE_URL")
LOCALE=$(envval NEXT_PUBLIC_DEFAULT_LOCALE)
# 这里必须是 if，不能写 `[ -n "$LOCALE" ] && ...`：条件为假时整行返回 1，set -e 直接退出
if [ -n "$LOCALE" ]; then
  ARGS+=(--build-arg "NEXT_PUBLIC_DEFAULT_LOCALE=$LOCALE")
fi

echo "==> aigc-app（NEXT_PUBLIC_SITE_URL=$SITE_URL，会被内联进前端产物）"
docker build --target runner -t aigc-app:latest "${ARGS[@]}" .

echo "==> aigc-migrate"
docker build --target migrate -t aigc-migrate:latest .

echo "==> aigc-cron"
docker build -t aigc-cron:latest deploy/cron
