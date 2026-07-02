# 部署说明

## 一、整体设备分工

本项目采用四台设备分工：

1. Windows 控制机
2. Ubuntu 开发机
3. Ubuntu 服务端
4. 阿里云穿透端

---

## 二、Windows 控制机

Windows 控制机只作为远程控制入口使用。

用途：

- 打开 Codex
- SSH 连接 Ubuntu 开发机
- SSH 连接 Ubuntu 服务端
- 访问 GitHub
- 访问 Web 后台
- 查看部署状态

Windows 本地不保存项目代码，不运行数据库，不运行后端服务。

---

## 三、Ubuntu 开发机

Ubuntu 开发机用于开发。

开发机 IP：

```text
192.168.31.129
```

用途：

- 保存项目源码
- Codex 通过 SSH 连接进行开发
- 安装项目依赖
- 运行测试
- 构建 Android App
- 本地调试 API 和 Web 后台

开发机不作为正式业务运行服务器。

---

## 四、Ubuntu 服务端

Ubuntu 服务端用于后期部署运行系统。

用途：

- 运行 NestJS API
- 运行 Web 后台
- 运行 PostgreSQL
- 运行 Redis
- 运行 frpc
- 保存业务数据
- 执行数据库备份

当前阶段暂不操作 Ubuntu 服务端，等项目骨架和 Docker Compose 文件完成后再部署。

---

## 五、阿里云穿透端

阿里云 ECS 只作为 FRP 服务端使用。

用途：

- 运行 frps
- 提供公网入口
- 不部署业务代码
- 不部署数据库
- 不部署 Redis
- 不部署 Web 后台

frps 信息：

```text
frps 公网地址：42.121.105.101
frps 通信端口：7000
frps HTTP vhost 端口：8080
HTTPS：开发验证阶段暂不启用
dashboard：仅阿里云本机可访问，不开放公网
```

---

## 六、域名与访问地址

主域名：

```text
lnize.top
```

API 域名：

```text
api.lnize.top
```

Web 后台域名：

```text
admin.lnize.top
```

开发验证阶段访问地址：

```text
API：http://api.lnize.top:8080
Web 后台：http://admin.lnize.top:8080
```

DNS 解析：

```text
api.lnize.top    → 阿里云 ECS 公网 IP
admin.lnize.top  → 阿里云 ECS 公网 IP
```

---

## 七、端口规划

Ubuntu 服务端本地端口：

```text
后端 API：3000
Web 后台：3001
PostgreSQL：5432
Redis：6379
```

阿里云 frps 端口：

```text
frps 通信端口：7000
HTTP vhost 访问端口：8080
```

公网访问对应关系：

```text
http://api.lnize.top:8080
→ 阿里云 frps
→ Ubuntu 服务端 frpc
→ 127.0.0.1:3000
→ NestJS API
```

```text
http://admin.lnize.top:8080
→ 阿里云 frps
→ Ubuntu 服务端 frpc
→ 127.0.0.1:3001
→ Web 后台
```

PostgreSQL 和 Redis 只允许本地访问，不允许穿透到公网。

---

## 八、部署方式

项目后期使用 Docker Compose 部署。

Ubuntu 服务端应运行：

- api
- web-admin
- postgres
- redis
- frpc

项目需要提供：

```text
docker-compose.dev.yml
docker-compose.prod.yml
.env.example
deploy/frpc.example.toml
数据库备份脚本
数据库恢复脚本
```

---

## 九、环境变量要求

真实配置不得提交到 GitHub。

允许提交：

```text
.env.example
frpc.example.toml
README.md
部署说明文档
```

禁止提交：

```text
.env
.env.local
.env.production
frpc.toml
frps.toml
数据库密码
frp token
JWT_SECRET
高德 Key
SSH 密钥
Android 签名证书
数据库备份文件
```

所有敏感信息必须通过环境变量读取。

---

## 十、首次初始化要求

Web 后台初次启动时，如果系统中不存在管理员账号，必须进入首次初始化流程。

首次初始化需要设置：

1. 管理员账号
2. 管理员密码
3. 进价查看安全密码

要求：

- 密码只保存 hash
- 不保存明文密码
- 初始化完成后关闭首次初始化入口
- 后续不能重复初始化
- 进价查看密码只能由有权限的管理员修改

---

## 十一、安全要求

1. App 开单时不能显示商品进价。
2. 查看商品进价必须具备权限。
3. 查看商品进价必须输入安全密码。
4. 进价查看操作必须写入审计日志。
5. 订单修改、订单作废、删除数据等重要操作必须写入审计日志。
6. PostgreSQL 不允许开放公网。
7. Redis 不允许开放公网。
8. frps dashboard 不允许开放公网。
9. 所有 API 必须有登录认证。
10. 所有敏感配置必须通过环境变量读取。

---

## 十二、迁移要求

项目必须支持后期迁移到其他设备。

迁移时应只需要：

1. 新设备安装 Ubuntu
2. 安装 Docker 和 Docker Compose
3. 克隆 GitHub 仓库
4. 复制 `.env.production`
5. 恢复 PostgreSQL 数据库备份
6. 启动 Docker Compose
7. 启动 frpc
8. 确认 API 和 Web 后台访问正常

项目代码中不得写死服务器 IP、frp token、数据库密码、JWT_SECRET、高德 Key。

---

## 十二、当前生产部署步骤

本阶段允许操作 Ubuntu 服务端。服务端信息：

```text
Ubuntu 服务端 IP：192.168.31.128
部署路径：/opt/xlt-delivery-system
GitHub 仓库：https://github.com/LPZ55556/xlt-delivery-system
```

### 1. 服务端环境

服务端需要 Git、Docker Engine 和 Docker Compose。检查命令：

```bash
docker --version
docker compose version || docker-compose --version
git --version
```

### 2. 拉取代码

```bash
sudo mkdir -p /opt/xlt-delivery-system
sudo chown -R $(whoami):$(whoami) /opt/xlt-delivery-system
git clone https://github.com/LPZ55556/xlt-delivery-system.git /opt/xlt-delivery-system
cd /opt/xlt-delivery-system
git pull
git status
```

如果目录已存在，先确认它是本仓库且没有未提交本地改动，不要直接删除。

### 3. 创建 `.env.production`

在服务端本地创建 `/opt/xlt-delivery-system/.env.production`，不要提交 Git。示例字段：

```bash
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3000
WEB_ADMIN_PORT=3001
WEB_PORT=3001
POSTGRES_DB=delivery_db
POSTGRES_USER=delivery_user
POSTGRES_PASSWORD=<真实强密码>
DATABASE_URL=postgresql://delivery_user:<真实强密码>@postgres:5432/delivery_db
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<真实强密码或留空>
JWT_SECRET=<openssl rand -base64 48>
JWT_EXPIRES_IN=7d
FIRST_RUN_SETUP_ENABLED=true
NEXT_PUBLIC_API_BASE_URL=http://api.lnize.top:8080
API_BASE_URL=http://api.lnize.top:8080
WEB_ADMIN_URL=http://admin.lnize.top:8080
```

生成密钥示例：

```bash
openssl rand -base64 48
```

### 4. 创建 `deploy/frpc.toml`

在服务端本地基于 `deploy/frpc.example.toml` 创建 `/opt/xlt-delivery-system/deploy/frpc.toml`，不要提交 Git。Docker Compose 中 frpc 与 API/Web 位于同一网络，`localIP` 使用服务名：

```toml
serverAddr = "42.121.105.101"
serverPort = 7000

auth.method = "token"
auth.token = "<真实 frp token>"

[[proxies]]
name = "delivery-api"
type = "http"
localIP = "api"
localPort = 3000
customDomains = ["api.lnize.top"]

[[proxies]]
name = "delivery-admin"
type = "http"
localIP = "web-admin"
localPort = 3001
customDomains = ["admin.lnize.top"]
```

外部访问端口由阿里云 frps 的 `vhostHTTPPort=8080` 决定，`customDomains` 不写端口。

### 5. 启动服务

```bash
cd /opt/xlt-delivery-system
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps

# Ubuntu ??????? docker-compose v1????
docker-compose --env-file .env.production -f docker-compose.prod.yml config
docker-compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker-compose --env-file .env.production -f docker-compose.prod.yml ps
```

### 6. 数据库迁移

首次部署执行迁移，不要执行 `migrate reset`，不要清空数据库：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api pnpm prisma:migrate:deploy
# docker-compose v1?
docker-compose --env-file .env.production -f docker-compose.prod.yml exec api pnpm prisma:migrate:deploy
```

### 7. 验证

本地验证：

```bash
curl http://127.0.0.1:3000/api/health
curl -I http://127.0.0.1:3001
```

frpc 日志：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 frpc
# docker-compose v1?
docker-compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 frpc
```

公网验证：

```bash
curl http://api.lnize.top:8080/api/health
curl -I http://admin.lnize.top:8080
```

如果公网失败，依次检查 DNS 是否解析到 `42.121.105.101`、阿里云安全组是否开放 `8080`、frps 是否启用 `vhostHTTPPort=8080`、frpc token 是否正确、`customDomains` 是否冲突、API/Web 是否在容器内监听 `0.0.0.0`。

### 8. 首次初始化和 App 联调

打开 `http://admin.lnize.top:8080`，无管理员时应进入 `/first-run-setup`。初始化后创建配送员账号、商户和商品。Android App 使用服务端 API 时重新构建：

```bash
MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile build:android:standalone
```

### 9. 回滚和安全

回滚优先使用用户已创建的服务端快照。正式运行后需要定期备份 PostgreSQL 数据。PostgreSQL `5432`、Redis `6379` 只绑定服务端本机 `127.0.0.1`，不得通过 frpc 暴露公网。frpc 只代理 API 和 Web，不代理数据库、Redis 或 frps dashboard。


## Android App mobile MVP notes

This round adds the mobile MVP for scanning, ranking, location track, product management and merchant management.

- Barcode scanning uses `react-native-vision-camera` code scanner. Camera permission is requested when entering the scan page. Supported code types include EAN-13, EAN-8, UPC-A, UPC-E, Code128, Code39 and QR.
- Mobile product management supports list/search/create/edit/disable and barcode scan fill-in. The app does not show or submit `costPrice`.
- Mobile merchant management supports list/search/create/edit/disable, check-in, manual address entry, current-location point fill-in, and AMap POI search when `AMAP_WEB_SERVICE_KEY` is configured.
- Product sales ranking uses `GET /api/reports/product-sales-ranking` and never returns cost price or profit.
- Today track uses `POST /api/locations/check-in`, `POST /api/locations/track-points`, and `GET /api/locations/my-today-track`. Only foreground location is used in this MVP.
- AMap keys must be injected by environment variables at build time: `AMAP_ANDROID_KEY` and `AMAP_WEB_SERVICE_KEY` or `AMAP_WEB_KEY`. Do not commit real keys.
- Standalone build example: `MOBILE_API_BASE_URL=http://api.lnize.top:8080 AMAP_ANDROID_KEY=your_key AMAP_WEB_SERVICE_KEY=your_key pnpm --filter @xlt/mobile build:android:standalone`.
- Because `react-native-webview` requires Android minSdk 24, the mobile Android minSdk is now 24. Android 9+ devices remain supported.
- VisionCamera frame processors are disabled; code scanner remains enabled.
