#!/usr/bin/env bash
# 把备份同步到另一个 OSS bucket（异地那份）。在宿主机上跑，需要先装 ossutil。
#
#   export OSS_BACKUP_BUCKET=my-backup-bucket
#   export OSS_BACKUP_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
#   ./deploy/scripts/upload-backups.sh
#
# 加到 root crontab，每天比 backup.sh 晚半小时：
#   47 3 * * * cd /opt/aigc && ./deploy/scripts/upload-backups.sh >> /var/log/aigc-upload.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${OSS_BACKUP_BUCKET:?缺少 OSS_BACKUP_BUCKET}"
: "${OSS_BACKUP_ENDPOINT:?缺少 OSS_BACKUP_ENDPOINT}"

command -v ossutil >/dev/null 2>&1 || {
  echo "没装 ossutil：https://help.aliyun.com/zh/oss/developer-reference/ossutil"
  exit 1
}

# --update：只传新增/变化的文件，不然每天把 30 份 dump 全推一遍
for sub in daily monthly; do
  [ -d "deploy/backups/$sub" ] || continue
  ossutil cp -r -f --update \
    -e "$OSS_BACKUP_ENDPOINT" \
    "deploy/backups/$sub" "oss://$OSS_BACKUP_BUCKET/backups/$sub/"
done

echo "✅ 已同步到 oss://$OSS_BACKUP_BUCKET/backups/"
