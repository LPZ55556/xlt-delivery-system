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

## 5. 构建 debug APK

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

## 6. 真机 USB 调试运行

1. Android 手机开启开发者选项和 USB 调试。
2. 使用 USB 连接 Ubuntu 开发机。
3. 执行：

```bash
adb devices
MOBILE_API_BASE_URL=http://api.lnize.top:8080 pnpm --filter @xlt/mobile android
```

如果设备显示 `unauthorized`，请在手机上确认 USB 调试授权。

## 7. 调试版 SHA1

后续接入高德定位等 SDK 时可能需要调试版 SHA1：

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

如果 `~/.android/debug.keystore` 不存在，先执行一次 Android debug 构建，Gradle 通常会自动生成；也可以通过 Android Studio 或标准 debug keystore 生成流程创建。

## 8. 后续权限占位

当前 Manifest 只申请 `INTERNET`，用于访问后端 API。扫码、定位、蓝牙打印仍是占位功能，后续接入时再按实际 SDK 和 Android 版本精确申请运行时权限：

- `CAMERA`：摄像头扫码。
- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`：高德定位和轨迹。
- `BLUETOOTH` / `BLUETOOTH_CONNECT` / `BLUETOOTH_SCAN`：蓝牙打印，需区分 Android 版本。

不要在未接入真实功能前提交高德 Key、正式 keystore 或蓝牙设备密钥。
