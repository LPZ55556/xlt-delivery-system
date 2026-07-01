# 智慧配送解决方案

智慧配送解决方案是一套面向货物配送商的配送开单管理系统。App 名称为“小灵通”，Android 包名为 `com.xlt.delivery`。

系统包含 Android App、Web 管理后台、NestJS 后端 API、PostgreSQL、Redis 和 FRP 本地服务器穿透部署模板。

## 项目结构

```text
apps/mobile          React Native Android App 骨架
apps/web-admin       Next.js Web 管理后台骨架
services/api         NestJS 后端 API 骨架
packages/shared      共享类型与金额工具
docker-compose.*.yml Docker Compose 开发/生产模板
deploy               FRP 模板配置
docs                 产品、部署和准备文档
```

## 技术选型

- 包管理：pnpm workspace
- 语言：TypeScript
- 后端：NestJS + Prisma
- Web 后台：Next.js / React
- Android App：React Native Android
- 数据库：PostgreSQL
- 缓存：Redis
- 部署：Docker Compose
- 穿透：服务端后续使用 frpc 连接已有 frps

## 开发环境启动

在 Ubuntu 开发机的项目目录执行：

```bash
pnpm install
pnpm dev:api
pnpm dev:web
```

后端默认监听 `http://127.0.0.1:3000`，健康检查路径为 `GET /api/health`。

Web 后台默认监听 `http://127.0.0.1:3001`。

Android App 当前是 React Native Android 骨架。构建前需要安装 Android SDK、JDK 和 Gradle 所需环境，然后执行：

```bash
pnpm --filter @xlt/mobile android
```

## 数据库迁移

开发环境可以使用本机 PostgreSQL 或 Docker Compose 中的 PostgreSQL。迁移命令示例：

```bash
DATABASE_URL="postgresql://delivery_user:change_me@127.0.0.1:5432/delivery_db" pnpm --filter @xlt/api exec prisma migrate deploy
```

首次初始化接口：

```text
GET  /api/first-run-setup/status
POST /api/first-run-setup
```

首次初始化会创建超级管理员、保存管理员密码 hash、保存进价查看安全密码 hash，并写入审计日志。初始化完成后会拒绝再次初始化。

认证接口：

```text
POST /api/auth/login
GET  /api/auth/me
```

登录接口会校验 bcrypt 密码并签发 JWT，响应中的用户对象不会返回 `passwordHash`。登录成功和失败都会写入审计日志。

API 默认启用全局 JWT Guard。健康检查、登录和首次初始化入口标记为公开接口，其余接口默认需要 Bearer token。
商品接口当前最小实现：

```text
GET    /api/products
GET    /api/products/:id
POST   /api/products
PATCH  /api/products/:id
DELETE /api/products/:id
POST   /api/products/:id/cost-price-verification
```

商品列表和详情默认不返回进价。查看进价需要 `super_admin`、`admin` 或 `finance` 角色，并且必须输入首次初始化时设置的进价查看安全密码。查看成功和失败都会写入审计日志。


## Docker Compose

开发环境：

```bash
docker compose -f docker-compose.dev.yml up --build
# 如果系统只有 docker-compose v1，也可以使用：
docker-compose -f docker-compose.dev.yml up --build
```

生产环境模板：

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

PostgreSQL 和 Redis 的端口只绑定到 `127.0.0.1`，不得通过 FRP 暴露到公网。

## 环境变量

以 `.env.example` 为模板创建本地 `.env`，真实值只在本地或部署环境填写。

必须从环境变量读取的敏感配置包括：`POSTGRES_PASSWORD`、`DATABASE_URL`、`REDIS_PASSWORD`、`JWT_SECRET`、`FRP_TOKEN`、`AMAP_ANDROID_KEY`、`AMAP_WEB_KEY`。

不要提交真实 `.env`、`.env.local`、`.env.production`、`frpc.toml`、`frps.toml`、数据库备份、SSH 密钥、Android keystore 或任何真实密码/token/key。

## 当前阶段已完成

- 创建 monorepo 目录结构。
- 初始化 NestJS API 骨架与 `/api/health` 健康检查。
- 完成 Prisma schema 与初始迁移文件。
- 预留 PostgreSQL/Prisma 与 Redis 配置读取。
- 预留 users、merchants、orders、reports、locations、audit-logs 模块。
- 完成首次初始化最小闭环：管理员账号、管理员密码 hash、进价查看安全密码 hash、初始化关闭、审计日志。
- 完成基础登录接口：bcrypt 密码校验、JWT 签发、当前用户查询、登录审计。
- 增加全局 JWT Guard、`@Public()`、`@Roles()` 和 `@CurrentUser()` 基础设施，业务接口默认需要登录。
- 实现商品管理最小 CRUD，普通查询不返回进价，进价查看需要角色权限、安全密码和审计日志。
- 初始化 Web 后台页面骨架，并让首次初始化页可以提交 API。
- 初始化 React Native Android App 骨架，包含首页、底部导航、中间加大的“开单”按钮、登录、开单、扫码、商户选择、今日轨迹占位。
- 创建共享类型和金额工具，占位采用 decimal string / minor units 思路，避免 float 直接计算金额。
- 提供开发和生产 Docker Compose 模板。
- 保留 FRP 客户端示例模板，不生成真实 `frpc.toml`。

## 当前阶段占位内容

- 角色权限细粒度策略仍为占位，JWT Guard 和角色元数据基础设施已有最小实现。
- 商户、订单、报表、轨迹和审计日志接口目前只返回占位响应。
- App 暂不接入高德地图、扫码、蓝牙打印和离线同步，只预留页面和配置入口。

## 下一阶段建议任务

1. 细化角色和权限模型，将 `@Roles()` 应用到后台敏感接口。
2. 实现商户、订单基础 CRUD，并确保 App 开单接口继续不返回商品进价。
3. 接入审计日志，覆盖进价查看、订单修改、订单作废和删除操作。
4. 为 Web 后台接入 API 状态检测、登录态和首次初始化跳转逻辑。
5. 完善 Android 构建环境并验证 debug APK。
