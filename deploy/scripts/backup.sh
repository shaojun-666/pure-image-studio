#!/bin/sh
# 数据库备份：pg_dump -Fc（自定义格式，自带压缩）。
# 保留策略：日报留 BACKUP_KEEP_DAYS 天，每月 1 号那份另存一年。
#
# ★ 备份落在宿主机 deploy/backups/ 里，这只能防「手滑删库」，防不了「这台机器没了」。
#   异地那份用 deploy/scripts/upload-backups.sh 同步到另一个 OSS bucket。
set -eu

DIR=${BACKUP_DIR:-/backups}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}
STAMP=$(date +%Y%m%d-%H%M)
DAY=$(date +%d)
MONTH=$(date +%Y%m)

mkdir -p "$DIR/daily" "$DIR/monthly"
OUT="$DIR/daily/aigc-$STAMP.dump"

echo "[backup] pg_dump -> $OUT"
pg_dump -Fc --no-owner -f "$OUT"

# 空文件/半截文件比没有更危险：它会让人以为有备份
if [ ! -s "$OUT" ]; then
  echo "[backup] 产物为空，判定失败"
  exit 1
fi
echo "[backup] 完成 $(du -h "$OUT" | cut -f1)"

if [ "$DAY" = "01" ]; then
  cp "$OUT" "$DIR/monthly/aigc-$MONTH.dump"
  echo "[backup] 另存月报 aigc-$MONTH.dump"
fi

# ── 保留策略 ──
find "$DIR/daily" -name '*.dump' -type f -mtime "+$KEEP_DAYS" -print -delete
# 月报只留最近 12 份（sort -r 按文件名，即按年月倒序）
ls -1 "$DIR/monthly" 2>/dev/null | sort -r | tail -n +13 | while read -r old; do
  rm -f "$DIR/monthly/$old"
  echo "[backup] 清理月报 $old"
done
