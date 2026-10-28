# Pure 图像工作室

一个面向课堂演示与个人作品集的全栈 AI 生图网站。支持多家模型 Provider、异步生成队列、积分体系、作品广场与后台管理，并附带一套单机 Docker Compose 部署与备份方案。

## 功能

- **文生图 / 图生图**：统一的生成参数面板，支持尺寸、数量、随机种子、负面提示词等能力按模型动态收敛
- **形象一致性**：上传角色参考图后，在后续生成中保持角色外观（本项目核心卖点）
- **模型目录**：Provider 抽象层，已接入火山引擎方舟、阿里云百炼、ofox 中转站；没有 key 时自动退回 Mock Provider 跑通全链路
- **异步任务队列**：生成任务落库，内嵌 worker 按租约领取执行，SSE 推送进度，超时自动重试与退款
- **积分体系**：注册赠送、每日免费额度、生成扣费、失败退款、流水账本
- **作品广场 / 历史 / 收藏夹**：公开作品浏览、个人历史、集合管理
- **后台管理**：用户、生成记录、模型、风格、提示词、广场内容
- **国际化**：`zh` / `en` 双语（next-intl）
- **存储抽象**：本地磁盘或阿里云 OSS + CDN，两种驱动同一套接口

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js 15 App Router、React 19、Tailwind CSS、shadcn/ui 风格组件、Zustand、TanStack Query |
| 后端 | Next.js Route Handlers、Auth.js v5、Zod |
| 数据 | PostgreSQL、Prisma 7 |
| 图像 | sharp（缩略图 / 格式转换）、ali-oss |
| 部署 | Docker 多阶段构建、nginx、Docker Compose、pg_dump 备份 |
| 验收 | Playwright 脚本覆盖各阶段主流程 |

## 架构

```
浏览器 ──▶ nginx ──▶ Next.js app:3000 ──▶ PostgreSQL
                        │
                        ├─▶ Provider（Ark / DashScope / ofox / Mock）
                        ├─▶ 存储（local / OSS ──▶ CDN）
                        └─▶ worker（同进程，租约领取任务）
cron ──▶ pg_dump ──▶ deploy/backups/
```

生成请求只负责落库并返回任务 ID；worker 领取任务后调用 Provider，图片写入存储，前端通过 SSE 订阅状态。任务用租约（lease）防止 worker 挂掉后任务永久卡死。

## 本地运行

```bash
# 1. 依赖
pnpm install

# 2. 起数据库
docker compose -f docker-compose.dev.yml up -d

# 3. 配置环境变量
cp .env.example .env
#    至少填 DATABASE_URL；Provider key 留空则只注册 Mock 模型

# 4. 建表 + 灌初始数据（模型目录、风格、提示词、广场内容）
pnpm db:push
pnpm db:seed

# 5. 启动
pnpm dev
```

访问 `http://localhost:3000`。种子管理员由 `.env` 中的 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` 指定，留空则跳过创建。

### 常用命令

```bash
pnpm dev          # 开发服务器
pnpm build        # 生产构建
pnpm typecheck    # TypeScript 检查
pnpm db:seed      # 重跑种子（改模型目录后必须重跑）
```

## 部署

单机 Docker Compose：`db → migrate → app（Next + 内嵌 worker）→ nginx`，另有 `cron` 容器负责夜间备份与对账。完整步骤、回滚方式、排错清单见 [deploy/README.md](deploy/README.md)。

关键点：

- 镜像用 `deploy/scripts/build.sh` 显式构建，不用 `docker compose build`
- 内存小于 3G 的机器需本机构建镜像后 `docker save | ssh | docker load`
- 生产环境变量以 `.env.production.example` 为准，密钥不进仓库

## 项目结构

```
src/
├── app/            # App Router 页面与 Route Handlers
├── components/     # 生成器、编辑器、广场、后台等 UI
├── server/
│   ├── providers/  # 各模型厂商适配
│   ├── generation/ # 任务创建、租约、状态机
│   ├── worker/     # 内嵌 worker
│   ├── credits/    # 积分与账本
│   └── storage/    # local / OSS 存储驱动
├── lib/            # 通用工具、hooks、AI 辅助
└── i18n/           # 多语言
prisma/             # schema、迁移、种子数据
deploy/             # Compose、nginx、构建/部署/备份脚本
docs/               # 需求分析文档
messages/           # zh / en 文案
scripts/            # Playwright 验收脚本
```

## 文档

- [需求分析与核心功能](docs/2-软件需求分析与核心功能.md)
- [部署手册](deploy/README.md)

## 已知限制

- 备份的异地同步需手动配置 ossutil 与 crontab
- 登录 / 注册接口没有 nginx 层限流，仅有应用层生成接口限流
- 未接入日志采集与告警
