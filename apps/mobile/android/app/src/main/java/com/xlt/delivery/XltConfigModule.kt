package com.xlt.delivery

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class XltConfigModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "XltConfig"

  override fun getConstants(): MutableMap<String, Any> = mutableMapOf(
    "apiBaseUrl" to BuildConfig.MOBILE_API_BASE_URL,
    "amapAndroidKey" to BuildConfig.AMAP_ANDROID_KEY,
    "amapWebServiceKey" to BuildConfig.AMAP_WEB_SERVICE_KEY,
  )
}
