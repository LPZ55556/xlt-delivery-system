# 源源食品 Codex 开发提示词文档

> 使用方式：把本文件与以下三个准备文档一起放进项目工作目录，然后把“第一轮实际发送给 Codex 的提示词”复制给 Codex。
>
> 建议放入工作目录的准备文档：
> 1. `源源食品_配置清单_修订版.txt`
> 2. `源源食品_env_example.txt`
> 3. `frpc.example.toml.txt`
>
> 注意：包含真实密码、token、Key 的 `.env.local`、`.env.production` 或“本地填写版_勿提交”文件，不建议放进 Git 仓库，也不建议让 Codex 修改、打印或提交。真实敏感值只在部署时由用户手动填写。

---

## 一、项目总体说明

我要开发一套面向货物配送商的“源源食品”。系统包含 Android 手机 App、Web 管理后台和后端 API。

系统以手机 App 为主，Web 后台为辅助。配送员主要通过 Android App 完成到店定位、选择商户、扫码开单、调整商品数量、生成电子清单、打印热敏小票、上传订单和轨迹等操作。管理员通过 Web 后台维护商品、商户、人员、权限、订单、库存、报表、进价安全查看和配送轨迹。

项目后期需要支持迁移到其他设备部署，因此必须从一开始就做到配置与代码分离、Docker Compose 部署、数据库可备份恢复、frpc 使用模板配置、敏感信息不写死在代码仓库中。

---

## 二、当前设备分工

本项目采用四台设备分工：

### 1. Windows 控制机

用途：

- 打开 Codex
- 通过 SSH 控制 Ubuntu 开发机
- 使用浏览器访问 GitHub、Web 后台和接口测试页面
- 不保存项目源码
- 不运行数据库、后端、Redis、Web 后台

### 2. Ubuntu 开发机

用途：Codex 通过 SSH 连接这台机器完成开发、测试、构建。

已知信息：

- 系统：Ubuntu 22.04
- 局域网 IP：`192.168.31.129`
- 项目源码目录建议：`/home/dev/projects/delivery-system`

开发机需要承担：

- 保存 Git 仓库
- 安装依赖
- 修改代码
- 运行测试
- 构建 Android App
- 本地开发调试

### 3. Ubuntu 服务端

用途：实际部署运行系统，但当前阶段暂不要求操作服务端。

已知信息：

- 系统：Ubuntu 22.04
- 局域网 IP：`192.168.31.128`

后续部署时服务端负责运行：

- NestJS API
- Next.js Web 后台
- PostgreSQL
- Redis
- frpc
- 数据库备份脚本

### 4. 阿里云穿透端

用途：只运行 frps，不部署业务代码、不部署数据库、不部署 Redis、不部署 Web 后台。

已知信息：

- frps 公网地址：`42.121.105.101`
- frps 通信端口：`7000`
- HTTP vhost 端口：`8080`
- HTTPS 当前暂未启用
- frps 已由用户自行配置，项目不需要安装、修改或管理 frps

---

## 三、域名与访问地址

当前开发验证阶段使用 HTTP + 8080 端口。

- 主域名：`lnize.top`
- API 域名：`api.lnize.top`
- Web 后台域名：`admin.lnize.top`
- App 请求 API 地址：`http://api.lnize.top:8080`
- Web 后台访问地址：`http://admin.lnize.top:8080`

后续正式测试前建议升级为 HTTPS：

- `https://api.lnize.top`
- `https://admin.lnize.top`

当前映射关系：

```text
http://api.lnize.top:8080
→ 阿里云 frps
→ Ubuntu 服务端 frpc
→ Ubuntu 服务端 127.0.0.1:3000
→ NestJS API

http://admin.lnize.top:8080
→ 阿里云 frps
→ Ubuntu 服务端 frpc
→ Ubuntu 服务端 127.0.0.1:3001
→ Web 管理后台
```

---

## 四、技术栈要求

使用 TypeScript 作为主要语言，尽量统一前后端类型。

- 手机端：React Native
- Web 后台：Next.js / React
- 后端：NestJS
- ORM：Prisma
- 数据库：PostgreSQL
- 缓存：Redis
- 部署：Docker Compose
- 代码管理：GitHub
- 地图定位：高德地图 Android SDK / Web 地图能力预留
- 扫码：手机摄像头扫描商品条码
- 打印：蓝牙热敏打印机，先封装打印接口和模板，具体品牌后续适配

---

## 五、项目目录要求

请创建 monorepo 结构：

```text
delivery-system/
├── apps/
│   ├── mobile/              # Android App / React Native
│   └── web-admin/           # Web 管理后台
├── services/
│   └── api/                 # NestJS 后端 API
├── packages/
│   ├── shared/              # 公共类型、枚举、工具函数
│   └── ui/                  # 可选，公共 UI 组件
├── deploy/
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   ├── frpc.example.toml
│   ├── backup-db.sh
│   └── restore-db.sh
├── docs/
│   ├── product.md
│   ├── deployment.md
│   ├── environment.md
│   └── api.md
├── .env.example
├── .gitignore
├── AGENTS.md
└── README.md
```

---

## 六、安全与配置要求

### 1. 敏感信息要求

禁止在代码中写死以下内容：

- frp token
- 数据库密码
- Redis 密码
- JWT_SECRET
- 高德 Key
- 管理员密码
- 进价查看密码
- 服务器 SSH 密码

所有敏感内容必须通过 `.env` 或运行环境变量配置。

必须提交：

- `.env.example`
- `frpc.example.toml`

必须忽略：

```gitignore
.env
.env.local
.env.production
*.key
*.pem
frpc.toml
```

### 2. 首次使用初始化要求

Web 后台初始管理员密码和进价查看密码不通过环境变量预置明文。

系统第一次启动时，如果数据库中不存在管理员账号，Web 后台必须进入首次初始化流程。

首次初始化流程要求：

1. 设置管理员账号。
2. 设置管理员登录密码。
3. 设置进价查看安全密码。
4. 密码必须二次确认。
5. 后端只保存密码 hash，不保存明文。
6. 初始化完成后，自动关闭初始化入口。
7. 初始化完成后再次访问初始化接口必须返回拒绝。
8. 初始化过程要写入操作日志。

建议环境变量：

```env
FIRST_RUN_SETUP_ENABLED=true
ADMIN_INITIAL_USERNAME=admin
ADMIN_PASSWORD_SETUP_MODE=first_run
COST_PRICE_PASSWORD_SETUP_MODE=first_run
STORE_PASSWORD_AS_HASH_ONLY=true
```

### 3. 权限要求

至少包含角色：

- super_admin：超级管理员
- admin：管理员
- finance：财务
- warehouse：仓库
- salesperson：配送员

配送员不能看到：

- 商品进价
- 利润
- 其他配送员的详细业绩
- 后台系统设置
- 进价查看密码

查看商品进价必须满足：

1. 用户具有进价查看权限。
2. 输入正确的进价查看安全密码。
3. 操作写入审计日志。

---

## 七、核心业务功能

### 1. App 端核心流程

配送员使用流程：

1. 登录 App。
2. 进入首页看板。
3. 点击底部中间加大的“开单”按钮。
4. 选择当前商户。
5. 调用定位，辅助判断当前到达店铺。
6. 打开摄像头扫码商品条码。
7. 根据条码匹配商品名称、规格和售价。
8. 默认数量为 1，可加减数量。
9. 生成电子清单，展示单价、数量、小计、总价。
10. App 端不显示进价。
11. 提交订单。
12. 调用蓝牙热敏打印服务打印小票。
13. 上传订单、商户、配送员、定位点和时间。
14. 如果网络异常，订单本地缓存，恢复网络后自动同步。

### 2. App 首页看板

首页不显示“今日配送任务”。

首页显示“今日营业概览”，包含：

- 今日营业额
- 已配送商户数量
- 今日订单数
- 今日售出商品数
- 未同步订单提醒
- 未打印订单提醒
- 今日轨迹入口
- 商品销量排行入口
- 商户列表入口
- 历史订单入口
- 打印机连接入口
- 库存查询入口

底栏中间为加大版“开单”按钮。

### 3. 小票打印要求

小票内容至少包含：

- 店铺名称
- 配送员名称
- 日期时间
- 订单号
- 商品名称
- 单价
- 数量
- 小计
- 合计金额

先封装通用打印接口：

```ts
printReceipt(order: OrderReceipt): Promise<void>
```

具体蓝牙打印机品牌后续适配。

### 4. Web 后台功能

Web 后台至少包含：

- 首次初始化页面
- 登录页
- 首页看板
- 商品管理
- 商品分类
- 条码管理
- 商户管理
- 用户和角色管理
- 订单管理
- 订单详情
- 库存管理
- 配送轨迹
- 商品销量排行
- 商户销售排行
- 配送员业绩
- 进价安全查看
- 系统设置
- 操作日志

### 5. 地图和轨迹

要求：

- App 端上传定位点。
- 到店时记录商户、配送员、经纬度、时间。
- Web 后台可以查看当天配送轨迹。
- 地图上的当前位置头像标明业务员名称。
- 轨迹先实现基础按时间连线，后续再优化轨迹平滑。

---

## 八、数据库设计要求

至少设计以下表：

- users
- roles
- permissions
- user_roles
- products
- product_categories
- merchants
- orders
- order_items
- inventory_records
- location_points
- visit_records
- print_logs
- audit_logs
- app_settings
- first_run_setup_state 或等效设置项

订单明细必须保存快照字段：

- product_name_snapshot
- sale_price_snapshot
- spec_snapshot

原因：商品后续改名或改价时，历史订单不能被影响。

金额字段不能使用浮点数直接计算，应使用 Decimal / numeric 类型。

---

## 九、部署要求

### 1. Docker Compose

项目必须提供：

- `deploy/docker-compose.dev.yml`
- `deploy/docker-compose.prod.yml`

服务端部署时至少包含：

- api
- web-admin
- postgres
- redis
- frpc

### 2. frpc

阿里云 frps 已经由用户自行配置，项目不要安装或管理 frps。

只需要提供 `deploy/frpc.example.toml`，模板中使用环境变量或占位符：

```toml
serverAddr = "${FRP_SERVER_ADDR}"
serverPort = ${FRP_SERVER_PORT}

auth.method = "token"
auth.token = "${FRP_TOKEN}"

[[proxies]]
name = "delivery-api"
type = "http"
localIP = "127.0.0.1"
localPort = 3000
customDomains = ["api.lnize.top"]

[[proxies]]
name = "delivery-admin"
type = "http"
localIP = "127.0.0.1"
localPort = 3001
customDomains = ["admin.lnize.top"]
```

注意：`customDomains` 中不要写端口号。访问端口由 frps 的 `vhostHTTPPort = 8080` 决定。

### 3. 数据库备份和迁移

必须提供：

- `deploy/backup-db.sh`
- `deploy/restore-db.sh`

备份要求：

- 默认每日备份
- 备份目录通过环境变量配置
- 默认保留 7 天
- 支持迁移到其他设备后恢复数据库

---

## 十、开发阶段划分

不要一次性把所有功能塞完。按阶段开发。

### 第一阶段：项目初始化

目标：创建项目骨架和基础运行环境。

必须完成：

- monorepo 项目结构
- apps/mobile 基础项目
- apps/web-admin 基础项目
- services/api 基础项目
- packages/shared 基础包
- README.md
- AGENTS.md
- .env.example
- .gitignore
- docker-compose.dev.yml
- docker-compose.prod.yml
- frpc.example.toml
- 基础健康检查接口 `/health`

### 第二阶段：数据库与认证

必须完成：

- Prisma schema
- PostgreSQL 连接
- Redis 连接
- 用户表、角色表、权限表
- JWT 登录
- RBAC 权限控制
- 首次初始化流程
- 密码 hash 存储

### 第三阶段：商品、商户、订单 API

必须完成：

- 商品管理 API
- 条码查询商品 API
- 商户管理 API
- 订单创建 API
- 订单详情 API
- 订单状态 API
- 订单防重复提交
- 操作日志

### 第四阶段：Web 后台

必须完成：

- 首次初始化页面
- 登录页面
- 首页看板
- 商品管理
- 商户管理
- 订单管理
- 进价安全查看
- 报表基础页面
- 轨迹基础页面

### 第五阶段：Android App

必须完成：

- 登录
- 首页看板
- 商户选择
- 扫码开单
- 商品数量调整
- 电子清单
- 提交订单
- 打印接口封装
- 定位上传
- 今日轨迹入口
- 离线订单缓存

### 第六阶段：部署验证

必须完成：

- Ubuntu 服务端 Docker Compose 部署
- frpc 连接阿里云 frps
- 外网访问 API
- 外网访问 Web 后台
- 数据库备份恢复验证
- 文档补充

---

## 十一、第一轮实际发送给 Codex 的提示词

下面这段可以直接复制给 Codex：

```text
请先阅读当前工作目录中的准备文档：

1. 源源食品_配置清单_修订版.txt
2. 源源食品_env_example.txt
3. frpc.example.toml.txt
4. 本提示词文档

我要开发一套“源源食品”，用于货物配送商。系统包含 Android App、Web 管理后台和 NestJS 后端 API。App 为主，Web 后台为辅助。App 负责配送员到店定位、选择商户、扫码开单、调整数量、生成电子清单、蓝牙热敏打印小票、上传订单和轨迹；Web 后台负责商品、商户、用户权限、订单、库存、报表、配送轨迹、进价安全查看和操作日志。

当前设备分工如下：

- Windows 控制机：只用于打开 Codex、SSH 和浏览器，不保存项目源码。
- Ubuntu 开发机：IP 为 192.168.31.129，Codex 通过 SSH 在这台机器上开发、测试和构建。
- Ubuntu 服务端：IP 为 192.168.31.128，后续用于部署 API、Web 后台、PostgreSQL、Redis 和 frpc。当前阶段暂不操作服务端。
- 阿里云穿透端：只运行 frps，不部署业务代码。frps 已由用户自行配置，项目不需要安装或管理 frps。

当前对外地址：

- API：http://api.lnize.top:8080
- Web 后台：http://admin.lnize.top:8080

技术栈要求：

- Mobile：React Native
- Web Admin：Next.js / React
- API：NestJS
- ORM：Prisma
- DB：PostgreSQL
- Cache：Redis
- Language：TypeScript
- Deploy：Docker Compose

请先完成第一阶段：项目初始化。不要一次性实现全部业务。

第一阶段必须完成：

1. 创建 monorepo 项目结构：
   - apps/mobile
   - apps/web-admin
   - services/api
   - packages/shared
   - deploy
   - docs

2. 创建基础文档：
   - README.md
   - AGENTS.md
   - docs/product.md
   - docs/deployment.md
   - docs/environment.md
   - docs/api.md

3. 创建配置模板：
   - .env.example
   - .gitignore
   - deploy/frpc.example.toml
   - deploy/docker-compose.dev.yml
   - deploy/docker-compose.prod.yml

4. 后端 services/api 需要先提供：
   - NestJS 基础项目
   - /health 健康检查接口
   - 环境变量读取结构
   - Prisma 初始化结构
   - Redis 连接预留

5. Web 后台 apps/web-admin 需要先提供：
   - Next.js 基础项目
   - 基础布局
   - 登录页占位
   - 首次初始化页占位
   - 首页看板占位

6. Mobile apps/mobile 需要先提供：
   - React Native 基础项目
   - API_BASE_URL 配置入口
   - 登录页占位
   - 首页看板占位
   - 底部中间加大“开单”按钮占位

7. deploy 目录需要提供：
   - frpc.example.toml，使用 api.lnize.top 和 admin.lnize.top，不要写端口到 customDomains 中
   - docker-compose.dev.yml
   - docker-compose.prod.yml
   - backup-db.sh
   - restore-db.sh

8. 安全要求：
   - 不要把 frp token、数据库密码、JWT_SECRET、高德 Key、管理员密码、进价查看密码写死到代码里
   - 不要提交 .env.local、.env.production、真实 frpc.toml
   - .gitignore 必须忽略敏感文件
   - Web 后台初始管理员密码和进价查看密码必须设计为首次使用时由用户设置，系统只保存 hash

9. 迁移要求：
   - 不写死设备 IP、域名、token、密码
   - 所有配置从环境变量读取
   - 使用 Docker Compose 管理服务
   - 提供数据库备份和恢复脚本

完成第一阶段后，请输出：

1. 你创建了哪些目录和文件
2. 如何在 Ubuntu 开发机上启动开发环境
3. 如何运行 API 健康检查
4. 下一阶段建议实现哪些内容

请不要操作 Ubuntu 服务端，不要尝试修改阿里云 frps，不要读取或输出任何真实敏感值。
```

---

## 十二、后续每一阶段给 Codex 的简短提示词

### 第二阶段提示词

```text
请基于现有项目进入第二阶段：数据库与认证。实现 Prisma schema、PostgreSQL 连接、Redis 连接、JWT 登录、RBAC 权限控制和首次初始化流程。首次初始化时设置管理员账号、管理员密码和进价查看安全密码，后端只保存 hash，初始化完成后关闭初始化入口。不要写死任何密码或 token。
```

### 第三阶段提示词

```text
请进入第三阶段：商品、商户和订单 API。实现商品管理、商品分类、条码查询商品、商户管理、订单创建、订单详情、订单状态、订单防重复提交和操作日志。订单明细必须保存商品名称、规格、售价快照。配送员接口不能返回进价。
```

### 第四阶段提示词

```text
请进入第四阶段：Web 管理后台。实现首次初始化页面、登录页、首页看板、商品管理、商户管理、订单管理、进价安全查看、销售报表基础页面、配送轨迹基础页面和操作日志页面。
```

### 第五阶段提示词

```text
请进入第五阶段：Android App。实现登录、首页营业概览、商户选择、扫码开单、数量调整、电子清单、订单提交、打印接口封装、定位上传、今日轨迹入口和离线订单缓存。App 端不能显示进价。
```

### 第六阶段提示词

```text
请进入第六阶段：部署验证。完善 Docker Compose 生产部署、frpc 模板、数据库备份恢复脚本和部署文档。注意阿里云只运行 frps，不要管理 frps。Ubuntu 服务端运行 API、Web 后台、PostgreSQL、Redis 和 frpc。
```
