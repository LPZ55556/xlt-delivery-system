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

商户接口当前最小实现：

```text
GET    /api/merchants?page=1&pageSize=20&search=关键词
GET    /api/merchants/:id
POST   /api/merchants
PATCH  /api/merchants/:id
DELETE /api/merchants/:id
```

商户删除为停用，不做物理删除。商户列表默认只返回启用商户，支持基础分页和名称搜索。`super_admin` / `admin` 可以创建、编辑、停用商户；`salesperson`、`finance`、`warehouse` 可以读取商户信息。

订单接口当前最小实现：

```text
POST  /api/orders
GET   /api/orders?page=1&pageSize=20
GET   /api/orders/:id
GET   /api/orders/:id/receipt
PATCH /api/orders/:id/void
```

订单创建规则：

1. 必须登录。
2. `merchantId` 必须存在且商户启用。
3. `items` 不能为空。
4. `productId` 必须存在且商品启用。
5. `quantity` 必须为大于 0 的整数。
6. 商品价格以后端数据库中的 `salePrice` 为准，不信任前端传入价格。
7. 订单主表、订单明细和审计日志在同一个数据库事务中写入。
8. 订单总金额由后端使用 Decimal 计算，响应固定两位小数。
9. 当前阶段预留库存扣减，未实际扣减库存。

订单明细快照规则：

- 保存商品名称快照 `productNameSnapshot`。
- 保存商品条码快照 `productBarcodeSnapshot`。
- 保存商品规格快照 `productSpecSnapshot`。
- 保存销售价快照 `salePriceSnapshot`。
- 保存数量和小计，避免商品后续改价影响历史订单。

订单安全规则：

- 订单和小票接口严禁返回 `costPrice`。
- `super_admin` / `admin` / `finance` 可以查看全部订单。
- `salesperson` 只能查看自己的订单。
- 作废订单仅允许 `super_admin` / `admin`，并写入审计日志。
- 创建订单和作废订单都会写入审计日志。



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
- 预留 users、reports、locations、audit-logs 模块。
- 完成首次初始化最小闭环：管理员账号、管理员密码 hash、进价查看安全密码 hash、初始化关闭、审计日志。
- 完成基础登录接口：bcrypt 密码校验、JWT 签发、当前用户查询、登录审计。
- 增加全局 JWT Guard、`@Public()`、`@Roles()` 和 `@CurrentUser()` 基础设施，业务接口默认需要登录。
- 实现商品管理最小 CRUD，普通查询不返回进价，进价查看需要角色权限、安全密码和审计日志。
- 实现商户管理最小 CRUD，支持分页、搜索、启用过滤和软停用。
- 实现订单开单最小闭环，包含事务创建、商品快照、金额计算、订单列表/详情、作废和小票数据接口。
- 初始化 Web 后台页面骨架，并让首次初始化页可以提交 API。
- 初始化 React Native Android App，并完成登录、首页、商户选择、商品选择、电子清单、订单创建、我的订单、订单详情和小票预览的最小闭环。
- 创建共享类型和金额工具，占位采用 decimal string / minor units 思路，避免 float 直接计算金额。
- 提供开发和生产 Docker Compose 模板。
- 保留 FRP 客户端示例模板，不生成真实 `frpc.toml`。

## 当前阶段占位内容

- 角色权限细粒度策略仍为占位，JWT Guard 和角色元数据基础设施已有最小实现。
- 报表、轨迹和审计日志接口目前只返回占位响应。
- App 暂不接入高德地图、真实摄像头扫码、蓝牙打印和离线同步，只预留页面和配置入口。

## 下一阶段建议任务

1. 细化角色和权限模型，将 `@Roles()` 应用到后台敏感接口。
2. App 开单页面接入商户、商品和订单 API。
3. Web 后台接入商户/订单页面，补齐表格、筛选和详情视图。
4. 实现用户管理和配送员账号创建流程。
5. 完善 Android 构建环境并验证 debug APK。


## Web 后台业务页面

Web 后台位于 `apps/web-admin`，当前已从占位页推进为可用的基础管理后台。主要路由如下：

```text
/login              登录页
/first-run-setup    首次初始化页
/dashboard          后台首页
/products           商品管理
/merchants          商户管理
/orders             订单列表
/orders/:id         订单详情和小票预览
/users              用户管理
/settings           系统设置占位
```

后台主页面包含左侧菜单、顶部当前用户信息和退出登录。未登录访问业务页面会跳转到 `/login`；已登录访问登录页会跳转到 `/dashboard`。

### Web 后台环境变量

Web 后台调用后端 API 时读取：

```bash
NEXT_PUBLIC_API_BASE_URL=<后端 API 地址>
```

前端代码不写死 API 域名、服务器 IP、数据库密码、frp token、高德 Key 或 JWT_SECRET。真实 `.env`、`.env.local` 和 `.env.production` 不得提交到 Git。

### 登录与首次初始化

- 登录页调用 `POST /api/auth/login`，成功后保存 JWT token 和用户基础信息。
- 业务接口请求会自动携带 Bearer token。
- 接口返回 401 时，Web 后台会清除本地登录状态并跳转登录页。
- 首次初始化页调用 `GET /api/first-run-setup/status` 判断是否可初始化。
- 首次初始化提交管理员账号、管理员密码和进价查看安全密码；前端只提交明文，不保存明文，后端只保存 hash。
- 初始化完成后跳转登录页，后续不能重复初始化。

### 商品管理页面

商品管理页接入以下接口：

```text
GET    /api/products
GET    /api/products/:id
POST   /api/products
PATCH  /api/products/:id
DELETE /api/products/:id
POST   /api/products/:id/cost-price-verification
```

页面支持商品列表、按名称或条码搜索、新增、编辑、停用和详情查看。普通列表和详情不展示 `costPrice`。查看进价必须通过单独按钮输入进价查看安全密码，验证成功后只在当前页面临时显示验证结果；成功或失败审计由后端写入。

售价和进价输入按 decimal string 提交，页面不使用 float 计算金额。

### 商户管理页面

商户管理页接入以下接口：

```text
GET    /api/merchants
GET    /api/merchants/:id
POST   /api/merchants
PATCH  /api/merchants/:id
DELETE /api/merchants/:id
```

页面支持商户列表、按名称搜索、新增、编辑、停用和详情查看。经纬度当前为手动输入，高德地图选点后续再接入。

### 订单管理页面

订单管理页接入以下接口：

```text
GET   /api/orders
GET   /api/orders/:id
PATCH /api/orders/:id/void
GET   /api/orders/:id/receipt
```

页面支持订单列表、状态筛选、订单详情、商品快照明细、商户信息、配送员信息、定位信息、订单作废和小票预览。订单页面严禁展示商品进价、利润、密码 hash、token 或数据库信息。

订单作废入口仅对 `super_admin` / `admin` 显示，点击后需要二次确认并可填写作废原因；审计日志由后端写入。

小票预览展示店铺名称、配送员名称、日期时间、订单号、商品名称、单价、数量、小计和总价，当前阶段不连接打印机。

### Web 前端权限处理

前端根据当前登录用户角色做基础体验控制：

- `salesperson` 不显示进价查看入口，也不显示订单作废按钮。
- `finance` 可以查看订单，不显示商品/商户编辑入口。
- `admin` / `super_admin` 可以管理商品、商户并作废订单。
- `warehouse` 可按后端当前权限管理商品，商户为只读。

前端隐藏按钮只用于改善体验，真正权限校验以后端 JWT Guard 和角色控制为准。

### 当前仍为占位或后续开发

- 系统设置页仍是占位，后续接入进价安全密码轮换和审计日志查询。
- Dashboard 当前用列表接口计算基础统计，后续可增加专用统计接口。
- Web 后台暂不实现订单创建页面，App 开单页后续接入订单 API。
- 小票预览暂不连接打印机。
- 商户地图选点、轨迹管理和报表统计仍待后续开发。

### 下一步建议

1. App 开单页面接入商户、商品和订单创建 API。
2. Web 后台补充订单创建或补单入口。
3. App 登录和开单页接入配送员账号、商户、商品和订单创建 API。
4. 为 Dashboard、报表和轨迹增加专用后端查询接口。
5. 增加 Web 端端到端测试，覆盖登录、用户、商品、商户、订单和小票预览流程。


## 用户管理与配送员账号

后台用户管理 API 已接入，用于维护管理员、财务、仓库和配送员账号。用户数据复用 `User` 表，接口响应使用 `name` / `isActive` 语义字段，同时兼容当前系统内部的 `displayName` / `enabled` 字段。

用户管理接口：

```text
GET   /api/users?page=1&pageSize=20&search=关键词&role=salesperson&isActive=true
GET   /api/users/me
GET   /api/users/:id
POST  /api/users
PATCH /api/users/:id
PATCH /api/users/:id/password
PATCH /api/users/:id/disable
PATCH /api/users/:id/enable
```

`GET /api/auth/me` 继续保留，`GET /api/users/me` 也可用于获取当前登录用户。两个接口都不会返回 `passwordHash`。

用户角色：

```text
super_admin   超级管理员
admin         管理员
finance       财务
warehouse     仓库
salesperson   配送员
```

权限规则：

- `super_admin` 可以创建、编辑、禁用、启用所有角色用户。
- `admin` 可以创建、编辑、禁用、启用 `finance` / `warehouse` / `salesperson`。
- `admin` 不能创建、修改、重置密码、禁用或启用 `super_admin`。
- `finance` / `warehouse` / `salesperson` 不能管理用户。
- 用户不能禁用自己，也不能修改自己的角色。
- 被禁用用户不能登录；如果已登录用户被禁用，后续受保护 API 请求会失败并要求重新登录。

创建配送员账号示例：

```json
{
  "username": "zhangsan",
  "name": "张三",
  "phone": "13800000000",
  "role": "salesperson",
  "password": "初始密码"
}
```

密码只提交给后端，后端使用 bcrypt 保存 hash；响应、列表、详情、登录和当前用户接口均不返回 `passwordHash`。重置密码接口只接收 `newPassword`，同样只保存 hash，不返回明文密码。

用户管理审计日志动作：

```text
USER_CREATED
USER_UPDATED
USER_ROLE_CHANGED
USER_PASSWORD_RESET
USER_DISABLED
USER_ENABLED
USER_LOGIN_FAILED_DISABLED
```

审计日志记录操作人、目标用户、动作、成功状态和关键变更摘要，不记录明文密码。

Web 后台新增 `/users` 用户管理页面，左侧菜单仅对 `super_admin` / `admin` 显示“用户管理”。页面支持用户列表、搜索、角色筛选、启用状态筛选、新增、编辑、重置密码、禁用和启用。Dashboard 会在有权限时显示用户数量和配送员数量。

下一步建议：App 登录页接入 `POST /api/auth/login`，App 开单页使用配送员账号登录后接入商户、商品和订单创建 API。


## Android App 最小开单闭环

`apps/mobile` 当前沿用 React Native CLI 技术栈，App 名称为“小灵通”，Android 包名为 `com.xlt.delivery`。

当前 App 已实现：

- 配送员账号登录。
- 登录状态恢复和退出登录。
- 首页“今日营业概览”。
- 商户选择。
- 商品列表和按名称 / 条码搜索。
- 手动条码搜索作为扫码占位。
- 商品加入电子清单、调整数量、删除明细。
- 提交订单到 `POST /api/orders`。
- 我的订单列表。
- 订单详情。
- 小票数据预览。
- 今日轨迹、商品销量排行、打印机连接占位入口。

App 登录使用 Web 后台创建的 `salesperson` 配送员账号。被禁用用户不能登录；token 过期或接口返回 401 时，App 会清除本地登录状态并回到登录页。

### Mobile API 地址

移动端 API 地址通过环境变量读取：

```bash
MOBILE_API_BASE_URL=http://api.lnize.top:8080
```

也兼容 `API_BASE_URL`。业务代码不写死 API 域名、服务器 IP、数据库密码、frp token、高德 Key 或 JWT_SECRET。当前阶段 token 和用户信息通过 `@react-native-async-storage/async-storage` 的封装保存，后续可替换为系统 Keychain / Keystore 级安全存储。

### App 开单流程

```text
登录
→ 首页点击开单
→ 选择启用商户
→ 加载启用商品
→ 按名称或条码搜索商品
→ 加入电子清单
→ 调整数量或删除商品
→ 提交订单
→ 查看订单详情或小票预览
```

App 创建订单时只提交 `merchantId`、`productId` 和 `quantity`，不提交前端计算价格作为可信数据。商品售价以后端返回的 `salePrice` 为显示依据，最终订单总金额以后端订单响应为准。App 不展示 `costPrice`、进价或利润。

### 当前占位能力

- 扫码：当前为手动条码搜索和“扫码功能后续接入摄像头”提示，未接入摄像头权限或扫码 SDK。
- 定位 / 高德地图：当前不传经纬度，商户选择页和轨迹页保留占位，不写入真实高德 Key。
- 蓝牙打印：当前只展示小票预览，不连接蓝牙打印机。
- 今日订单：当前后端订单列表暂无日期筛选，App 先显示“我的订单”，首页用本地列表计算今日概览。

### 运行 mobile 开发环境

在 Ubuntu 开发机项目目录执行：

```bash
pnpm install
MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile start
pnpm --filter @xlt/mobile android
```

Android 真机/模拟器构建需要本机安装 Android SDK、Gradle/JDK 环境，并正确配置 `ANDROID_HOME` / `ANDROID_SDK_ROOT`。

下一步建议：接入摄像头扫码、蓝牙热敏打印、高德地图定位与轨迹，并为 App 增加离线订单缓存和网络恢复自动同步。


## Android debug APK 构建准备

`apps/mobile` 已确认为 React Native CLI 项目，保留现有 App 页面和 API client，并补齐 Android 原生工程构建入口。Android `applicationId` / `namespace` 为 `com.xlt.delivery`，App 显示名称为“小灵通”。

移动端构建脚本：

```bash
pnpm --filter @xlt/mobile android
pnpm --filter @xlt/mobile build:android:debug
pnpm --filter @xlt/mobile typecheck
pnpm --filter @xlt/mobile lint
```

Ubuntu 开发机需要安装 JDK 17 和 Android SDK，并配置：

```bash
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
```

安装 Android SDK 组件示例：

```bash
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

构建 debug APK：

```bash
pnpm --filter @xlt/mobile build:android:debug
```

产物路径为 `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`，APK、AAB、Gradle 缓存、build 产物、正式 keystore 和 `local.properties` 均不得提交。

真机运行前开启 USB 调试并检查设备：

```bash
adb devices
MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile android
```

移动端 API 地址继续通过 `MOBILE_API_BASE_URL` 读取，不在业务代码中写死地址。真实 `.env` 不提交。

当前扫码、定位、蓝牙打印仍为占位功能；Manifest 仅保留 API 访问所需 `INTERNET` 权限。后续接入真实功能时再精确申请 `CAMERA`、定位和蓝牙运行时权限。详细步骤见 `docs/android-build.md`。

下一步建议：在真机上验证登录和开单链路，随后分阶段接入摄像头扫码、高德定位、蓝牙打印，并补充移动端端到端测试。


## Mobile Metro 调试启动

`apps/mobile` 已补充 `metro.config.js`，用于 React Native CLI 在 pnpm monorepo 中解析依赖。配置包含仓库根目录 `watchFolders`，并同时设置 `apps/mobile/node_modules` 与根目录 `node_modules` 为 `resolver.nodeModulesPaths`。

启动 Metro：

```bash
cd apps/mobile
pnpm start
```

清缓存启动：

```bash
cd apps/mobile
pnpm start:reset-cache
# 或
npx react-native start --reset-cache
```

Android debug APK 真机运行流程：

```bash
cd apps/mobile
pnpm start
```

另开终端：

```bash
cd apps/mobile
adb reverse tcp:8081 tcp:8081
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.xlt.delivery/.MainActivity
```

当前入口注册名保持一致：`app.json` 的 `name` 为 `XltDelivery`，`index.js` 使用该名称注册，`MainActivity.getMainComponentName()` 返回 `XltDelivery`。如果 Metro 未启动或设备未执行 `adb reverse`，debug App 可能无法加载 JS bundle，表现为红屏、白屏或启动后退出。


### Android AppCompat 启动主题

Android debug App 的 `AppTheme` 继承自 `Theme.AppCompat.DayNight.NoActionBar`，并在 app 模块中依赖 `androidx.appcompat:appcompat`。如果真机启动后闪退，logcat 出现 `You need to use a Theme.AppCompat theme`，请检查 `AndroidManifest.xml`、`values/styles.xml` 和 `apps/mobile/android/app/build.gradle`。

抓取启动崩溃日志：

```bash
adb logcat -c
adb shell am start -n com.xlt.delivery/.MainActivity
adb logcat -d | grep -E "AndroidRuntime|com.xlt.delivery|AppCompat|ReactActivity"
```

debug APK 启动时仍需要 Metro：

```bash
cd apps/mobile
pnpm start
adb reverse tcp:8081 tcp:8081
```


### Metro bundle 检查

Metro 启动后可验证 Android bundle：

```bash
curl -I 'http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false&app=com.xlt.delivery'
```

返回 `200` 表示 bundle 可生成。若返回 `500` 并提示缺少 `@babel/runtime/helpers/...`，说明 pnpm monorepo 依赖未被 mobile 直接声明；当前 `apps/mobile` 已显式依赖 `@babel/runtime`。
