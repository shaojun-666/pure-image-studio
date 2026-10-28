#!/usr/bin/env bash
# 部署 / 升级。在服务器项目根目录跑：
#
#   ./deploy/scripts/deploy.sh               # 常规升级（会先构建镜像）
#   ./deploy/scripts/deploy.sh --no-build    # 镜像已 load 进来，跳过构建
#   ./deploy/scripts/deploy.sh --seed        # 首次部署，顺带灌初始数据
#
# 参数可组合，例如 --no-build --seed。
#
# ★ --no-build 是给内存不够的机器用的：本机只有 1.6GiB，`next build` 会把整机拖死
#   （build.sh 里有内存预检会主动拦下）。那种机器上的正确流程是：
#   本地构建 → 传镜像 → 再跑这个脚本 --no-build。
#
# 顺序刻意是「先起 db → 跑迁移 → 再起应用」：迁移失败时就该停在这里，
# 不要让新代码配上旧表结构对外服务。
set -euo pipefail
cd "$(dirname "$0")/../.."

NO_BUILD=0
SEED=0
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    --seed) SEED=1 ;;
    *) echo "未知参数：$arg（可用：--no-build / --seed）"; exit 1 ;;
  esac
done

ENV_FILE=${ENV_FILE:-.env}
COMPOSE=(docker compose --env-file "$ENV_FILE")

if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 $ENV_FILE：照 .env.production.example 填好再跑"
  exit 1
fi

if [ "$NO_BUILD" = "1" ]; then
  echo "==> 1/5 跳过构建（--no-build，用已 load 进来的镜像）"
else
  echo "==> 1/5 构建镜像"
  ENV_FILE="$ENV_FILE" ./deploy/scripts/build.sh
fi

echo "==> 2/5 启动数据库并等它就绪"
"${COMPOSE[@]}" up -d db
until "${COMPOSE[@]}" exec -T db pg_isready -q; do
  sleep 2
done

echo "==> 3/5 执行迁移"
# run 是同步的，退出码非 0 会被 set -e 拦在这里
"${COMPOSE[@]}" run --rm migrate

echo "==> 4/5 启动应用与网关"
"${COMPOSE[@]}" up -d --remove-orphans

echo "==> 5/5 等 app 健康"
for i in $(seq 1 40); do
  cid=$("${COMPOSE[@]}" ps -q app)
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo none)
  if [ "$status" = "healthy" ]; then
    echo "    app healthy"
    break
  fi
  if [ "$i" = "40" ]; then
    echo "    app 迟迟没健康，最后 50 行日志："
    "${COMPOSE[@]}" logs --tail 50 app
    exit 1
  fi
  sleep 3
done

if [ "$SEED" = "1" ]; then
  echo "==> 灌初始数据（管理员 / 模型目录 / 风格 / 提示词 / 探索内容）"
  "${COMPOSE[@]}" run --rm seed
fi

# 旧镜像不清会把系统盘吃掉 —— 每次构建都会留一层。
# ★ 加 until 只清 7 天前的：不分青红皂白全清，会把刚构建出来的层一起删掉，
#   紧接着的一次部署就退化成全量冷构建 —— 在 1.6G 的机器上那是直接把机器拖死。
docker image prune -f --filter "until=168h"

echo
echo "✅ 部署完成。"
echo "   回滚：用上一版源码在本机重新构建镜像 → load 回来 → ./deploy/scripts/deploy.sh --no-build"
echo "        （两端目录都不是 git 仓库，没有 git checkout 可用）"
echo "   数据库迁移默认不回滚（Prisma 不生成 down 迁移），必要时从 deploy/backups 恢复。"
