# 部署手册

单机 Docker Compose：`db → migrate → app（Next + 内嵌 worker）→ nginx`，外加 `cron` 做夜间备份与对账。

```
浏览器 ──▶ nginx ──▶ app:3000 ──▶ db:5432
                        │
                        ├─▶ OSS（图片字节）──▶ CDN ──▶ 浏览器
                        └─▶ worker（同进程，instrumentation.ts 启动）
cron ──▶ pg_dump ──▶ deploy/backups/ ──(手动/定时)──▶ 异地 OSS
```

## 0. 上服务器之前

| 项 | 说明 |
|---|---|
| ECS | ≥2C4G / 40G 系统盘，Ubuntu 22.04 或 Alibaba Cloud Linux 3。**内存低于 3G 就构建不了镜像**（`build.sh` 会主动拒绝），得改走 §3 的本机构建流程 |
| Docker | 装完配镜像加速，否则 `docker.io` 拉取超时：`/etc/docker/daemon.json` 写 `{"registry-mirrors":["https://docker.m.daocloud.io"]}` 后 `systemctl restart docker` |
| 域名 + ICP | 大陆 IP 的 80/443 必须先备案（7–20 工作日）。开发期可先用香港节点或裸 IP |
| **生成式 AI 服务备案** | 公开提供 AI 生图服务在国内需要另行备案。**这是本项目最大的非技术风险，正式对外前务必先确认合规路径** |
| OSS | 一个 bucket，**私有**；只给 `public/*` 前缀加匿名只读桶策略 |
| RAM 子账号 | 授权限定到该 bucket，只要 `PutObject / GetObject / DeleteObject / ListObjects` |
| CDN | 绑 `cdn.example.cn` 指向该 bucket，**缓存规则忽略 query string**（否则 `x-oss-process` 各尺寸变体互相覆盖） |
| GitHub OAuth App | 回调填 `https://你的域名/api/auth/callback/github`（不做第三方登录可跳过） |

## 1. 首次部署

```bash
# 把代码放到 /opt/aigc
# ★ 这个目录不是 git 仓库 —— 现有部署是用 rsync/scp/tar 直接把源码推上去的，
#   所以「回滚 = git checkout」这套在这里行不通，见 §3。
cd /opt && git clone <仓库> aigc && cd aigc

# 环境变量
cp .env.production.example .env && chmod 600 .env
vi .env        # 至少填 POSTGRES_PASSWORD / AUTH_SECRET / CRON_SECRET /
               # NEXT_PUBLIC_SITE_URL / CDN_BASE_URL / OSS_* / SEED_ADMIN_*

# 起服务，并灌初始数据（管理员、模型目录、风格、提示词、探索内容）
./deploy/scripts/deploy.sh --seed
```

`deploy.sh` 里第一步是 `deploy/scripts/build.sh`：镜像用 `docker build` 显式构建，**不用 `docker compose build`**。两个原因——compose 的构建路径在部分环境会因 gRPC 会话头直接失败（Windows 上见过 `x-docker-expose-session-sharedkey contains value with non-printable ASCII characters`）；而且 `app/migrate/seed` 共用一份 Dockerfile，显式 build 能让三个 target 复用同一份层缓存。所以 compose 文件里只有 `image:` 没有 `build:`，单独跑 `docker compose up -d` 会因为找不到镜像而失败，先跑 `build.sh`。

`AUTH_SECRET` 用 `openssl rand -base64 32`，`CRON_SECRET` 用 `openssl rand -hex 24`。
`SEED_ADMIN_*` 只在 `--seed` 那一次用得上，之后可以从 `.env` 删掉。

跑完检查：

```bash
docker compose ps            # db/app/nginx/cron 都 Up，migrate 是 Exited (0)
curl -s localhost/api/health # {"ok":true,...,"db":"up"}
```

## 2. 上 TLS

阿里云给免费 DV 证书，下载得到「域名.pem / 域名.key」，改名丢进 `deploy/certs/`：

```bash
cp 你的域名.pem deploy/certs/fullchain.pem
cp 你的域名.key deploy/certs/privkey.pem
chmod 600 deploy/certs/privkey.pem

docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
```

覆盖层把 `deploy/nginx/tls/` 挂到 `/etc/nginx/conf.d` 顶掉明文那份：80 只做 ACME 挑战与 301 跳转，443 带 HSTS。

证书一年一换（免费 DV 有效期 1 年），换完 `docker compose restart nginx`。刻意没上 certbot：在容器里跑 DNS-01 要装阿里云插件再塞一份 RAM 密钥，维护成本高于一年手动换一次。

## 3. 日常升级与回滚

### 内存 ≥3G 的机器

```bash
./deploy/scripts/deploy.sh        # 构建 → 迁移 → 起服务 → 等健康 → 清旧镜像
```

### 内存不足的机器 —— 当前这台就是

**本机只有 1.6G 内存，构建不了镜像。** 跑 `next build` 会把 swap 打满、**整机用户态僵死**：
ICMP 正常，但 SSH 能建连却发不出 banner、nginx 端口 TCP 1ms 建连却几十秒零字节。
实测 40 分钟没构建完，最后只能从阿里云控制台强制重启，站点挂了约 40 分钟。

`build.sh` 有内存预检会主动拦下（`FORCE_BUILD=1` 可强行绕过，别用）。正确流程是**本机构建 + 传镜像**：

```bash
# 本机（CPU 越多越快）
docker build --target runner  -t aigc-app:latest --build-arg NEXT_PUBLIC_SITE_URL=<站点URL> .
docker build --target migrate -t aigc-migrate:latest .
docker save aigc-app:latest aigc-migrate:latest | gzip -1 | ssh <user>@<host> 'gunzip | docker load'

# 服务器：跳过构建，只做迁移 / 起服务 / 等健康
./deploy/scripts/deploy.sh --no-build
```

压缩后约 300MB，实测传输 1 分半。只有 `app` / `migrate` 改了才需要重传；`aigc-cron` 仅在 `deploy/cron` 变动时重建。
`--no-build` 可与 `--seed` 组合。

迁移失败会停在第 3 步，新代码不会配上旧表结构对外服务。

### 回滚

**两端目录都不是 git 仓库**，`git checkout` 在这里不可用。回滚 = 用上一版源码在本机重新构建镜像、`load` 回来，再跑 `./deploy/scripts/deploy.sh --no-build`。

数据库迁移**不回滚**（Prisma 不生成 down 迁移）。真出问题就从备份恢复，见下一节。

## 4. 备份与恢复

- `cron` 容器每天 03:17（Asia/Shanghai）跑 `pg_dump -Fc` 到宿主机 `deploy/backups/daily/`，保留 30 天；每月 1 号那份另存 `monthly/`，留 12 个月。
- **这只是「防手滑」，不是「防机器没了」**。异地那份要同步到另一个 bucket：

```bash
# 宿主机装 ossutil 后
export OSS_BACKUP_BUCKET=my-backup-bucket
export OSS_BACKUP_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
./deploy/scripts/upload-backups.sh

# 加进 root crontab（比备份晚半小时）
47 3 * * * cd /opt/aigc && ./deploy/scripts/upload-backups.sh >> /var/log/aigc-upload.log 2>&1
```

**恢复演练**（不是看看文件在不在，是真的恢复一遍再比行数）：

```bash
./deploy/scripts/restore-verify.sh                    # 取最新备份
./deploy/scripts/restore-verify.sh deploy/backups/daily/aigc-20260915-0317.dump
```

它会恢复到临时库、比对 `User/Generation/GenerationImage/CreditLedger` 行数、跑一条跨表查询验证外键，然后删掉临时库。**上线后第一个月做一次，之后每季度一次。**

真出事时的恢复：

```bash
docker compose stop app
docker compose exec -T db dropdb -U aigc --if-exists aigc
docker compose exec -T db createdb -U aigc aigc
docker compose exec -T db pg_restore -U aigc -d aigc --no-owner --no-privileges < deploy/backups/daily/xxx.dump
docker compose start app
```

## 5. 排查

```bash
docker compose logs -f app        # 应用 + worker
docker compose logs -f nginx      # 访问日志，含 upstream 耗时
docker compose logs -f cron       # 每轮备份/对账的输出
```

- **生成卡在 RUNNING 不动**：worker 在 app 进程里。租约 180s 过期后会被重新领取，最多 3 次尝试，之后退款。看 `docker compose logs app | grep executeClaimed`。
- **进度条转半天然后一次刷完**：SSE 被 Nginx 缓冲了。检查 `deploy/nginx/snippets/app-locations.conf` 里那条 `location ~ ^/api/generations/[^/]+/events$` 是否还在通用 `/api/` 之前。
- **图片 404 / 全裂**：八成是 `CDN_BASE_URL` 填成了 OSS 域名而不是 CDN 域名，或 OSS 桶策略没放开 `public/*`。
- **app 起来了但 nginx 502**：`docker compose restart app` 换了 IP。配置里上游写成变量 + `resolver` 就是为了这个，检查 `nginx.conf` 里的 `resolver 127.0.0.11` 还在不在。
- **`docker compose build` 报 gRPC 会话头错误 / 构建秒退且没有任何输出**：换 `./deploy/scripts/build.sh`，别跟 compose 的构建路径较劲。
- **seed 跑成功，但风格缩略图和探索封面全是裂图**：`seed` 服务必须和 `app` 挂同一个 `appdata` 卷。不挂的话用 local 驱动时它写进一次性容器的临时盘，容器一退就没了。
- **中文渲染成方块**：镜像里要有 `fonts-wqy-zenhei`。刻意没装 `fonts-noto-cjk`——那个包 56MB，国内网络实测从 deb.debian.org 和阿里云镜像都拉不完（同批 9MB 的 emoji 字体却正常）。要换回 Noto 就得接受这层构建可能反复失败。

## 6. 环境变量

以 `.env.production.example` 为准，这里只说几个容易搞错的：

| 变量 | 坑 |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | 会被内联进前端产物（hreflang / JSON-LD），**改域名必须重新 build**，光重启容器没用 |
| `CDN_BASE_URL` | 必须是 CDN 域名。填 OSS 域名不会报错，只会让 `public/*` 图全 404 |
| `OSS_USE_INTERNAL=true` | 同区 ECS 走内网 endpoint，免流量费 + 快约 10 倍。忘了配就是又慢又花钱 |
| `AUTH_URL` | 由 `NEXT_PUBLIC_SITE_URL` 派生（compose 里写死了这个映射），OAuth 回调地址依赖它 |
| `WORKER_ENABLED` | 想横向扩容时，再起一个同镜像的服务设 `WORKER_ENABLED=false` 专做 web，worker 留在原服务里 |

## 7. 已知缺口

- **备份的异地同步没有自动化**：`upload-backups.sh` 需要宿主机装 ossutil 并配 RAM 密钥，得手动加 crontab
- **没有 nginx 层的登录限流**：应用侧只对生成接口有限流（`RATE_LIMIT_GENERATIONS_PER_5MIN`），登录/注册接口没有
- **未做日志采集与告警**：目前只有 `docker compose logs` 和应用内 pino 输出
- **TLS 与真实 OSS 读写只在真机上才能验**：本地整套编排验收覆盖的是 nginx 明文 80 + local 驱动（13 项全过）。证书挂载、CDN 回源、OSS 的 put/get/delete 上服务器后要按第 2 节和第 1 节各跑一次实测
