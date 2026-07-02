#!/usr/bin/env bash
set -euo pipefail

APP_ID="com.xlt.delivery"
ACTIVITY="${APP_ID}/.MainActivity"
ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME}}"
export ANDROID_HOME ANDROID_SDK_ROOT
if [ -d "${ANDROID_HOME}/platform-tools" ]; then
  export PATH="${ANDROID_HOME}/platform-tools:${PATH}"
fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="${ROOT_DIR}/apps/mobile"
APK_PATH="${MOBILE_DIR}/android/app/build/outputs/apk/debug/app-debug.apk"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install Android platform-tools and ensure adb is on PATH." >&2
  exit 1
fi

if [ ! -d "${MOBILE_DIR}" ]; then
  echo "Mobile directory not found: ${MOBILE_DIR}" >&2
  exit 1
fi

device_count="$(adb devices | awk 'NR>1 && $2=="device" {count++} END {print count+0}')"
unauthorized_count="$(adb devices | awk 'NR>1 && $2=="unauthorized" {count++} END {print count+0}')"

if [ "${device_count}" -eq 0 ]; then
  adb devices -l
  if [ "${unauthorized_count}" -gt 0 ]; then
    echo "Device is unauthorized. Confirm USB debugging authorization on the phone." >&2
  else
    echo "No authorized Android device found. Connect a device with USB debugging enabled." >&2
  fi
  exit 1
fi

if [ ! -f "${APK_PATH}" ]; then
  echo "Debug APK not found: ${APK_PATH}" >&2
  echo "Run: pnpm --filter @xlt/mobile build:android:debug" >&2
  exit 1
fi

echo "Connected devices:"
adb devices -l

echo "Resetting adb reverse and forwarding Metro port..."
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081
adb reverse --list

if adb shell command -v curl >/dev/null 2>&1; then
  echo "Checking Metro from device localhost..."
  if ! adb shell 'curl --max-time 5 -sS http://localhost:8081/status' | grep -q 'packager-status:running'; then
    echo "Metro is not reachable from the device. Keep pnpm start running and retry." >&2
  fi
fi

echo "Installing debug APK: ${APK_PATH}"
adb install -r "${APK_PATH}"

if [ "${CLEAR_APP_DATA:-0}" = "1" ]; then
  echo "Clearing ${APP_ID} app data because CLEAR_APP_DATA=1"
  adb shell pm clear "${APP_ID}"
fi

echo "Starting ${ACTIVITY}"
adb shell am force-stop "${APP_ID}"
adb shell am start -n "${ACTIVITY}"

cat <<EOF

Debug app launched. Keep Metro running in another terminal:
  cd ${MOBILE_DIR}
  pnpm start -- --reset-cache

If Dev Settings has a stale host, rerun with:
  CLEAR_APP_DATA=1 ./scripts/mobile-debug-android.sh

Useful log command:
  adb logcat -c
  adb shell am start -n ${ACTIVITY}
  sleep 5
  adb logcat -d -v time | grep -iE "AndroidRuntime|FATAL EXCEPTION|ReactNativeJS|SoLoader|Unable to load script|BundleDownloader|${APP_ID}|localhost:8081|index.bundle"
EOF
