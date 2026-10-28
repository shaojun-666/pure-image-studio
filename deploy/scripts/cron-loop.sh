#!/bin/sh
# 夜间维护循环（容器里跑）。
# 不用 crond：busybox 的 crond 调起来要额外配 crontab 文件与日志转发，
# 而这里一天只干两件事，一个 sleep 循环足矣 —— 而且每轮输出直接进 docker logs。
set -eu

BACKUP_HOUR=${BACKUP_HOUR:-3}
BACKUP_MINUTE=${BACKUP_MINUTE:-17}
FIRE_AT=$(printf '%02d:%02d' "$BACKUP_HOUR" "$BACKUP_MINUTE")

echo "[cron] 已启动，每天 $FIRE_AT (TZ=$TZ) 备份并对账"

while :; do
  if [ "$(date +%H:%M)" = "$FIRE_AT" ]; then
    echo "[cron] $(date '+%F %T') 开始夜间维护"
    # 单件事失败不能拖垮循环：备份挂了也要照常对账，明天还得继续
    /scripts/backup.sh || echo "[cron] 备份失败，见上方输出"
    /scripts/reconcile.sh || echo "[cron] 对账失败，见上方输出"
    # 睡满一小时，避免在这一分钟里反复触发
    sleep 3600
  else
    sleep 30
  fi
done
