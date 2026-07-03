# Android debug 构建说明

本项目移动端位于 `apps/mobile`，当前使用 React Native CLI 技术栈。Android App 名称为“小灵通”，`applicationId` / `namespace` 为 `com.xlt.delivery`。

## 1. Ubuntu 开发机安装 Android SDK

JDK 建议使用 17。Android SDK 建议安装到 `/opt/android-sdk`：

```bash
sudo apt-get update
sudo apt-get install -y curl unzip
sudo mkdir -p /opt/android-sdk/cmdline-tools
cd /tmp
curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o commandlinetools-linux.zip
unzip -q commandlinetools-linux.zip -d android-cmdline-tools
sudo mv android-cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest
```

配置环境变量：

```bash
cat <<'EOF' | sudo tee /etc/profile.d/android-sdk.sh
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
EOF
source /etc/profile.d/android-sdk.sh
```

安装构建所需组件：

```bash
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

## 2. 检查 Android SDK

```bash
java -version
echo $ANDROID_HOME
echo $ANDROID_SDK_ROOT
sdkmanager --version
adb version
ls $ANDROID_HOME/platforms/android-35
ls $ANDROID_HOME/build-tools/35.0.0
```

## 3. 配置 mobile API 地址

移动端通过环境变量读取 API 地址，不要在业务代码中写死接口地址。开发时可在命令前传入：

```bash
MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile start
```

也可以在本机未提交的 `.env` 中配置同名变量。真实 `.env` 文件不得提交到 Git。

## 4. Gradle wrapper 检查

Android 原生工程应包含：

```bash
apps/mobile/android/gradlew
apps/mobile/android/gradle/wrapper/gradle-wrapper.properties
apps/mobile/android/gradle/wrapper/gradle-wrapper.jar
```

检查 wrapper：

```bash
cd apps/mobile/android
./gradlew --version
```

## 5. 启动 Metro

React Native debug 包需要 Metro 提供 JS bundle。移动端已提供 `apps/mobile/metro.config.js`，适配 pnpm monorepo：

- `watchFolders` 指向仓库根目录。
- `resolver.nodeModulesPaths` 同时包含 `apps/mobile/node_modules` 和根目录 `node_modules`。
- React / React Native 固定解析到 mobile 工作区依赖，避免重复实例。

启动 Metro：

```bash
cd apps/mobile
pnpm start
```

清缓存启动：

```bash
cd apps/mobile
pnpm start:reset-cache
```

也可以使用 React Native CLI：

```bash
cd apps/mobile
npx react-native start --reset-cache
```

## 6. 构建 debug APK

从仓库根目录执行：

```bash
pnpm --filter @xlt/mobile build:android:debug
```

或直接执行：

```bash
cd apps/mobile/android
./gradlew assembleDebug
```

构建产物位于 `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`。APK 和构建产物已加入 `.gitignore`，不得提交。

## 7. 真机 USB 调试运行

如果使用已经构建好的 debug APK，先保持 Metro 运行，再另开终端执行：

```bash
cd apps/mobile
adb reverse tcp:8081 tcp:8081
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.xlt.delivery/.MainActivity
```

如果通过 React Native CLI 直接安装运行：

1. Android 手机开启开发者选项和 USB 调试。
2. 使用 USB 连接 Ubuntu 开发机。
3. 执行：

```bash
adb devices
MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile android
```

如果设备显示 `unauthorized`，请在手机上确认 USB 调试授权。

## 8. 调试版 SHA1

后续接入高德定位等 SDK 时可能需要调试版 SHA1：

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

如果 `~/.android/debug.keystore` 不存在，先执行一次 Android debug 构建，Gradle 通常会自动生成；也可以通过 Android Studio 或标准 debug keystore 生成流程创建。

## 9. 后续权限占位

当前 Manifest 只申请 `INTERNET`，用于访问后端 API。扫码、定位、蓝牙打印仍是占位功能，后续接入时再按实际 SDK 和 Android 版本精确申请运行时权限：

- `CAMERA`：摄像头扫码。
- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`：高德定位和轨迹。
- `BLUETOOTH` / `BLUETOOTH_CONNECT` / `BLUETOOTH_SCAN`：蓝牙打印，需区分 Android 版本。

不要在未接入真实功能前提交高德 Key、正式 keystore 或蓝牙设备密钥。


## 10. AppCompat theme 检查

React Native debug Activity 运行时会走 AppCompat 启动链路。如果真机闪退并在 logcat 中出现：

```text
You need to use a Theme.AppCompat theme (or descendant) with this activity.
```

需要检查：

```bash
sed -n '1,160p' apps/mobile/android/app/src/main/AndroidManifest.xml
sed -n '1,160p' apps/mobile/android/app/src/main/res/values/styles.xml
grep -n "androidx.appcompat" apps/mobile/android/app/build.gradle
```

当前 `AppTheme` 应继承 `Theme.AppCompat.DayNight.NoActionBar`，并由 `AndroidManifest.xml` 的 application theme 引用。debug APK 仍需先启动 Metro：

```bash
cd apps/mobile
pnpm start
adb reverse tcp:8081 tcp:8081
```

常用 logcat 抓取命令：

```bash
adb logcat -c
adb shell am start -n com.xlt.delivery/.MainActivity
adb logcat -d | grep -E "AndroidRuntime|com.xlt.delivery|AppCompat|ReactActivity"
```


## 11. Metro bundle 接口检查

Metro 显示 `Dev server ready` 后，可以检查 Android bundle 是否能正常生成：

```bash
curl -I 'http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false&app=com.xlt.delivery'
```

期望返回 `200`。如果返回 `500`，查看响应正文，重点检查 pnpm monorepo 依赖解析。当前项目已将 `@babel/runtime` 声明为 mobile 直接依赖，避免 Metro 无法解析 Babel helper 导致 debug App 启动时报 `Unable to load script`。

## 12. debug 真机运行脚本

debug APK 不内置 JS bundle，必须保持 Metro 运行。推荐流程：

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

`scripts/mobile-debug-android.sh` 会检查 adb、检查设备授权、重置并配置 `adb reverse tcp:8081 tcp:8081`、从手机侧检查 Metro、安装 debug APK、停止并启动 `com.xlt.delivery/.MainActivity`。脚本不启动 Metro，因为 Metro 需要单独终端持续运行。如果曾经在 Dev Settings 中配置过错误的调试服务器，可使用 `CLEAR_APP_DATA=1 ./scripts/mobile-debug-android.sh` 只清理 `com.xlt.delivery` 后重装启动。

如果 `adb reverse --list` 正常但 App 仍连接开发机 IP 或旧地址，可能是 Dev Settings 保存过调试服务器。可以只清理当前 App 数据后重试：

```bash
adb shell pm clear com.xlt.delivery
```

如果 USB reverse 不可用，可在 React Native Dev Settings 中手动设置开发机地址，例如 `192.168.31.129:8081`。实际 IP 以 Ubuntu 开发机当前地址为准，不要写死到业务代码。

## 13. standalone APK 构建

standalone APK 用于内测安装运行，内置 JS bundle，不依赖 Metro，也不需要 `adb reverse`。当前使用默认 debug keystore 签名，不提交正式 keystore：

```bash
pnpm --filter @xlt/mobile build:android:standalone
```

构建脚本会优先读取已有 `ANDROID_HOME` / `ANDROID_SDK_ROOT`，未设置时默认使用 `/opt/android-sdk`。如果 SDK 安装在其他位置，请先导出真实路径。

产物路径：

```text
apps/mobile/android/app/build/outputs/apk/standalone/app-standalone.apk
```

React Native Gradle 插件会执行 `createBundleStandaloneJsAndAssets`，生成的 `index.android.bundle` 位于 `android/app/build/` 下的构建目录中。`android/app/build/`、APK、AAB 和手动 bundle 产物均已加入 `.gitignore`，不得提交。

验证 standalone APK：

```bash
cd /home/projects/xlt-delivery-system/apps/mobile
adb install -r android/app/build/outputs/apk/standalone/app-standalone.apk
adb shell am force-stop com.xlt.delivery
adb logcat -c
adb shell am start -n com.xlt.delivery/.MainActivity
sleep 5
adb logcat -d -v time | grep -iE "AndroidRuntime|FATAL EXCEPTION|ReactNativeJS|SoLoader|Unable to load script|BundleDownloader|com.xlt.delivery|localhost:8081|index.bundle"
```

standalone APK 正常时不应再访问 `localhost:8081/index.bundle`，logcat 中应能看到 `ReactNativeJS: Running "XltDelivery"`，且没有 `FATAL EXCEPTION` 或 `Unable to load script`。

debug APK 和当前 HTTP 开发 API 需要 Android 允许明文 HTTP；Manifest 已设置 `android:usesCleartextTraffic="true"`。后续生产环境切换 HTTPS 后应收紧该策略。

## 14. JS bundle 问题排查

常用命令：

```bash
adb logcat -c
adb shell am start -n com.xlt.delivery/.MainActivity
adb logcat -d -v time | grep -iE "AndroidRuntime|FATAL EXCEPTION|ReactNativeJS|SoLoader|Unable to load script|BundleDownloader|com.xlt.delivery"
```

判断方式：

- `You need to use a Theme.AppCompat theme`：检查 `styles.xml` 和 `AndroidManifest.xml` 的 AppCompat 主题配置。
- `Could not connect to development server`：debug APK 未连上 Metro，检查 `pnpm start`、`adb reverse --list` 和 Dev Settings 中的服务器地址。
- `Unable to load script` 且 standalone APK 也出现：检查 standalone 是否执行了 `createBundleStandaloneJsAndAssets`，以及 APK 是否包含 `index.android.bundle`。
- `ReactNativeJS` 后出现业务堆栈：说明 JS 已加载，继续按 JS 运行时异常定位。

## 连接生产 API 的 standalone APK

standalone APK 不依赖 Metro。构建时通过 `MOBILE_API_BASE_URL` 注入 API 地址，Android 原生层会把该值暴露给 React Native；设置页可查看当前 App 使用的 API 地址。

```bash
cd /home/projects/xlt-delivery-system
MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile build:android:standalone
```

产物路径：

```text
apps/mobile/android/app/build/outputs/apk/standalone/app-standalone.apk
```

安装到真机：

```bash
adb install -r apps/mobile/android/app/build/outputs/apk/standalone/app-standalone.apk
adb shell pm clear com.xlt.delivery
adb shell am start -n com.xlt.delivery/.MainActivity
```

当前生产 API 仍是 HTTP，Android Manifest 已允许明文 HTTP。上线前应切换 HTTPS 并收紧明文访问策略。

## 销售通 standalone APK 构建补充

构建连接服务端 API 的 standalone APK：

```bash
cd /home/projects/xlt-delivery-system
MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile build:android:standalone
```

APK 产物路径：

```bash
apps/mobile/android/app/build/outputs/apk/standalone/app-standalone.apk
```

本轮 App 名称为“销售通”，包名仍为 `com.xlt.delivery`。不要提交 APK、AAB、keystore、JKS、Gradle 缓存或 `local.properties`。

蓝牙热敏打印需要 Android 蓝牙权限。Android 12+ 会请求 `BLUETOOTH_CONNECT` / `BLUETOOTH_SCAN`，Android 11 及以下使用传统蓝牙权限。打印机需先在手机系统蓝牙中配对，App 内“更多 -> 小票管理 -> 打印机管理”会列出已配对设备并可选择 `mpt-III`。小票纸宽默认 72mm，可在 App 内按毫米自定义。
