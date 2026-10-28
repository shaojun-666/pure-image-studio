#!/bin/sh
# 触发一次余额对账。真正的逻辑在 /api/internal/cron/reconcile，
# 放在应用里而不是这里 —— 它要用同一套 Prisma 与流水写入路径，别在 shell 里重写一遍账本规则。
set -eu

: "${CRON_SECRET:?缺少 CRON_SECRET}"
: "${APP_BASE_URL:?缺少 APP_BASE_URL}"

curl -fsS -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  "$APP_BASE_URL/api/internal/cron/reconcile"
echo
