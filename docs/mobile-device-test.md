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
