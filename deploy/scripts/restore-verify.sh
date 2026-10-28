#!/usr/bin/env bash
# 真恢复一遍，再谈「我们有备份」。
#
#   ./deploy/scripts/restore-verify.sh [备份文件]      # 默认取最新的一份
#
# 做三件事：恢复到临时库 → 比对关键表行数 → 跑一条跨表查询证明外键与数据是通的。
# 全程只读线上库，最后删掉临时库。Phase 7 的验收项之一。
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=${ENV_FILE:-.env}
COMPOSE=(docker compose --env-file "$ENV_FILE")
# 改过 POSTGRES_USER 的话，导出同名变量再跑
PGUSER=${POSTGRES_USER:-aigc}
LIVEDB=${POSTGRES_DB:-aigc}
TMPDB=aigc_restore_verify
TABLES=(User Generation GenerationImage CreditLedger)

DUMP=${1:-}
if [ -z "$DUMP" ]; then
  DUMP=$(ls -1t deploy/backups/daily/*.dump 2>/dev/null | head -1 || true)
fi
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "找不到备份文件（先跑 deploy/scripts/backup.sh，或把路径作为第一个参数传进来）"
  exit 1
fi

cleanup() {
  "${COMPOSE[@]}" exec -T db dropdb -U "$PGUSER" --if-exists "$TMPDB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> 用 $DUMP 恢复到临时库 $TMPDB"
"${COMPOSE[@]}" exec -T db dropdb -U "$PGUSER" --if-exists "$TMPDB" >/dev/null
"${COMPOSE[@]}" exec -T db createdb -U "$PGUSER" "$TMPDB"
# pg_restore 从标准输入读，避免先把 dump 拷进容器
"${COMPOSE[@]}" exec -T db pg_restore -U "$PGUSER" -d "$TMPDB" --no-owner --no-privileges < "$DUMP"

echo "==> 比对行数（左=线上 右=恢复）"
fail=0
for t in "${TABLES[@]}"; do
  live=$("${COMPOSE[@]}" exec -T db psql -U "$PGUSER" -d "$LIVEDB" -tAc "SELECT count(*) FROM \"$t\"")
  restored=$("${COMPOSE[@]}" exec -T db psql -U "$PGUSER" -d "$TMPDB" -tAc "SELECT count(*) FROM \"$t\"")
  mark='✅'
  if [ "$live" != "$restored" ]; then
    # 站点在跑的时候，dump 之后又新增了行，对不上是正常的。
    # 但恢复出来的不能比线上少 —— 少说明这次备份是残缺的。
    mark='⚠️ '
    [ "$restored" -lt "$live" ] && { mark='❌'; fail=1; }
  fi
  printf '  %s %-18s %8s %8s\n' "$mark" "$t" "$live" "$restored"
done

echo "==> 跨表查询（证明外键和数据是通的，不只是行数对得上）"
orphans=$("${COMPOSE[@]}" exec -T db psql -U "$PGUSER" -d "$TMPDB" -tAc \
  'SELECT count(*) FROM "Generation" g LEFT JOIN "User" u ON u.id = g."userId" WHERE u.id IS NULL')
echo "  孤立 Generation（找不到用户）：$orphans"
[ "$orphans" = "0" ] || fail=1

if [ "$fail" != "0" ]; then
  echo "❌ 恢复校验未通过：这份备份不能用来救火"
  exit 1
fi
echo "✅ 恢复校验通过（临时库已删除）"
