# Android 真机调试说明

本说明用于在 Ubuntu 开发机上验证“小灵通” React Native debug APK。当前只覆盖调试启动链路，不接入扫码、定位或蓝牙打印。

## 1. 启动 Metro

```bash
cd /home/projects/xlt-delivery-system/apps/mobile
pnpm start
```

如果遇到缓存问题：

```bash
cd /home/projects/xlt-delivery-system/apps/mobile
pnpm start:reset-cache
```

也可以直接使用 React Native CLI：

```bash
cd /home/projects/xlt-delivery-system/apps/mobile
npx react-native start --reset-cache
```

## 2. 安装并启动 debug APK

另开一个终端，保持 Metro 不要关闭：

```bash
cd /home/projects/xlt-delivery-system/apps/mobile
adb reverse tcp:8081 tcp:8081
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.xlt.delivery/.MainActivity
```

`adb reverse tcp:8081 tcp:8081` 用于让手机上的 debug App 访问开发机上的 Metro。

## 3. 入口名称检查

当前入口名称保持一致：

- `apps/mobile/app.json`：`name` 为 `XltDelivery`。
- `apps/mobile/index.js`：`AppRegistry.registerComponent(appName, () => App)`。
- `MainActivity.getMainComponentName()`：返回 `XltDelivery`。

如果这些名称不一致，debug App 可能在启动时找不到 JS 组件并退出。

## 4. Metro monorepo 配置

`apps/mobile/metro.config.js` 已配置 pnpm monorepo 解析：

- 监听仓库根目录，支持 workspace 包变化。
- 同时查找 `apps/mobile/node_modules` 和根目录 `node_modules`。
- 固定 React / React Native 解析路径，降低重复依赖导致的运行时风险。

## 5. 常见问题

- `No Metro config found`：确认 `apps/mobile/metro.config.js` 存在，并在 `apps/mobile` 目录执行启动命令。
- App 白屏或提示无法连接 Metro：确认 Metro 正在运行，并执行 `adb reverse tcp:8081 tcp:8081`。
- 设备未授权：执行 `adb devices`，在手机上确认 USB 调试授权。
- 生产/正式包不依赖 Metro；本说明只针对 debug 调试包。


## 6. AppCompat theme 启动崩溃

如果真机启动后立刻退出，先抓取 logcat：

```bash
adb logcat -c
adb shell am start -n com.xlt.delivery/.MainActivity
adb logcat -d | grep -E "AndroidRuntime|com.xlt.delivery|AppCompat|ReactActivity"
```

如果看到 `You need to use a Theme.AppCompat theme (or descendant) with this activity`，说明 `MainActivity` 使用的 theme 不是 AppCompat 子类。应检查：

- `apps/mobile/android/app/src/main/AndroidManifest.xml` 中 application/activity 的 `android:theme`。
- `apps/mobile/android/app/src/main/res/values/styles.xml` 中 `AppTheme` 的 parent。
- `apps/mobile/android/app/build.gradle` 是否包含 `androidx.appcompat:appcompat` 依赖。

当前 `AppTheme` 继承自 `Theme.AppCompat.DayNight.NoActionBar`，用于兼容 ReactActivity/AppCompatActivity 启动链路。debug APK 启动时仍需要 Metro 和 `adb reverse tcp:8081 tcp:8081`。


## 7. Metro bundle 返回 500

如果 Metro 已启动但 App 仍提示 `Unable to load script`，先在 Ubuntu 开发机检查 bundle 接口：

```bash
curl -I 'http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false&app=com.xlt.delivery'
```

如果返回 500，再查看响应正文。pnpm monorepo 中常见原因是移动端缺少直接依赖，例如 `@babel/runtime` 没有在 `apps/mobile/package.json` 中声明。当前 mobile 已显式依赖 `@babel/runtime`，用于保证 Metro 可以解析 Babel helper。

## 8. 推荐真机测试顺序

建议先测试 standalone APK，再测试 debug APK：

1. 构建并安装 standalone APK，确认不启动 Metro 也能打开 App。
2. 启动 Metro，配置 `adb reverse`，再安装 debug APK。
3. 最后使用 Web 后台创建的配送员账号测试登录和开单。

standalone APK：

```bash
cd /home/projects/xlt-delivery-system
pnpm --filter @xlt/mobile build:android:standalone
adb install -r apps/mobile/android/app/build/outputs/apk/standalone/app-standalone.apk
adb shell am force-stop com.xlt.delivery
adb shell am start -n com.xlt.delivery/.MainActivity
```

debug APK：

```bash
cd /home/projects/xlt-delivery-system/apps/mobile
pnpm start -- --reset-cache
```

另开终端：

```bash
cd /home/projects/xlt-delivery-system
pnpm --filter @xlt/mobile build:android:debug
./scripts/mobile-debug-android.sh
```

如果曾经在 Dev Settings 中配置过错误的调试服务器，可使用 `CLEAR_APP_DATA=1 ./scripts/mobile-debug-android.sh` 只清理 `com.xlt.delivery` 后重装启动。

## 9. debug 红屏无法连接 Metro

如果红屏显示 `Could not connect to development server`，说明 debug APK 没有连上 Metro。按顺序检查：

```bash
adb devices -l
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081
adb reverse --list
curl http://127.0.0.1:8081/status
curl -I 'http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false&app=com.xlt.delivery'
```

`curl /status` 应返回 `packager-status:running`，bundle 接口应返回 `200`。debug APK 和当前 HTTP 开发 API 需要 Android 允许明文 HTTP；Manifest 已设置 `android:usesCleartextTraffic="true"`。后续生产环境切换 HTTPS 后应收紧该策略。如果设备曾在 Dev Settings 中设置过调试服务器 IP，必要时只清理当前 App 数据：

```bash
adb shell pm clear com.xlt.delivery
```

如果 USB reverse 不可用，可在 Dev Settings 中设置 `192.168.31.129:8081` 这类开发机地址，实际 IP 以 Ubuntu 开发机当前地址为准，不要写入业务代码。

## 10. standalone APK 说明

standalone APK 通过以下命令生成：

```bash
pnpm --filter @xlt/mobile build:android:standalone
```

生成路径：

```text
apps/mobile/android/app/build/outputs/apk/standalone/app-standalone.apk
```

该 APK 内置 JS bundle，安装后不需要 Metro，不需要 `adb reverse`，也不应访问 `localhost:8081/index.bundle`。构建脚本会优先读取已有 `ANDROID_HOME` / `ANDROID_SDK_ROOT`，未设置时默认使用 `/opt/android-sdk`。当前使用 debug keystore 签名，仅用于内测安装，不提交正式 keystore 或 APK 产物。

## 11. logcat 诊断

```bash
adb logcat -c
adb shell am start -n com.xlt.delivery/.MainActivity
sleep 5
adb logcat -d -v time | grep -iE "AndroidRuntime|FATAL EXCEPTION|ReactNativeJS|SoLoader|Unable to load script|BundleDownloader|com.xlt.delivery|localhost:8081|index.bundle"
```

- AppCompat theme 问题：会出现 `You need to use a Theme.AppCompat theme`。
- Metro 连接问题：会出现 `Could not connect to development server`、`BundleDownloader` 或 `localhost:8081/index.bundle`。
- standalone 缺少 bundle：standalone 启动时仍报 `Unable to load script`，需要检查 Gradle bundle 任务。
- JS 运行时异常：会出现 `ReactNativeJS` 业务堆栈，此时说明 bundle 已加载。

## 生产 API 真机联调流程

1. 确认 API 健康检查正常：

```bash
curl -i http://api.lnize.top:8080/api/health
```

2. 构建连接生产 API 的 standalone APK：

```bash
cd /home/projects/xlt-delivery-system
MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile build:android:standalone
```

3. 安装并清理旧数据：

```bash
adb install -r apps/mobile/android/app/build/outputs/apk/standalone/app-standalone.apk
adb shell pm clear com.xlt.delivery
adb shell am start -n com.xlt.delivery/.MainActivity
```

4. 进入 App 设置页确认 API 地址显示为 `http://api.lnize.top:8080`。不要显示 token、JWT、数据库密码或 frp token。

5. 如果登录失败，先在 Web 后台确认已完成首次初始化，并创建 `salesperson` 配送员账号。若商户或商品列表为空，先在 Web 后台创建启用商户和启用商品。

6. 启动日志排查：

```bash
adb logcat -c
adb shell am force-stop com.xlt.delivery
adb shell am start -n com.xlt.delivery/.MainActivity
sleep 8
adb logcat -d -v time | grep -iE "AndroidRuntime|FATAL EXCEPTION|ReactNativeJS|Unable to load script|Network request failed|api.lnize.top|xlt.delivery|fetch|TypeError|HTTP|Cleartext|CLEARTEXT"
```

## 销售通真机测试补充

推荐真机测试顺序：

1. 构建 standalone APK：
   `MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile build:android:standalone`
2. 安装并清理旧数据：
   `adb install -r apps/mobile/android/app/build/outputs/apk/standalone/app-standalone.apk`
   `adb shell pm clear com.xlt.delivery`
3. 启动 App：
   `adb shell am start -n com.xlt.delivery/.MainActivity`
4. 查看启动日志：
   `adb logcat -d -v time | grep -iE "AndroidRuntime|FATAL EXCEPTION|ReactNativeJS|Bluetooth|Printer|ESC|MPT|Network request failed|Cleartext|com.xlt.delivery"`

检查点：

- 桌面名称应显示“销售通”。
- 底部导航应为：首页、订单、开单、更多、设置，不再显示轨迹。
- 商品和订单普通页面不应显示 `costPrice`、进价、利润。
- 数据总览必须输入进价查看安全密码，密码错误应失败。
- 小票管理默认纸宽 72mm，可改为其他毫米值。选择已配对的 `mpt-III` 后可发送 ESC/POS 测试小票；如果打印机未开机、未配对或协议不兼容，App 应显示错误而不是闪退。
