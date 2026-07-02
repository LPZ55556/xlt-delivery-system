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
