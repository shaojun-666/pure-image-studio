# cron 容器。刻意不自己写 Dockerfile 里那套 crond —— 一个 sleep 循环的日志
# 直接躺在 `docker compose logs cron` 里，比查 crond 为什么不触发容易得多。
FROM postgres:16-alpine

# curl 用来打对账端点；tzdata 让 TZ=Asia/Shanghai 真的生效（否则备份时间戳是 UTC）
RUN apk add --no-cache curl tzdata \
 && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
 && echo "Asia/Shanghai" > /etc/timezone

CMD ["/bin/sh", "/scripts/cron-loop.sh"]
