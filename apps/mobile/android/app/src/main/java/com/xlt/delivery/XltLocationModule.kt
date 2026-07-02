package com.xlt.delivery

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Criteria
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class XltLocationModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "XltLocation"

  @ReactMethod
  fun getCurrentPosition(promise: Promise) {
    if (!hasLocationPermission()) {
      promise.reject("LOCATION_PERMISSION_DENIED", "Location permission is not granted.")
      return
    }
    val manager = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val providers = manager.getProviders(true)
    val lastKnown = providers.mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }.maxByOrNull { it.time }
    if (lastKnown != null && System.currentTimeMillis() - lastKnown.time < 120000) {
      promise.resolve(toMap(lastKnown))
      return
    }
    val provider = manager.getBestProvider(Criteria().apply { accuracy = Criteria.ACCURACY_FINE }, true) ?: LocationManager.NETWORK_PROVIDER
    val listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        manager.removeUpdates(this)
        promise.resolve(toMap(location))
      }
      override fun onProviderDisabled(provider: String) {}
      override fun onProviderEnabled(provider: String) {}
      override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }
    try {
      manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
    } catch (error: SecurityException) {
      promise.reject("LOCATION_PERMISSION_DENIED", error.message)
    } catch (error: Exception) {
      promise.reject("LOCATION_UNAVAILABLE", error.message)
    }
  }

  private fun hasLocationPermission(): Boolean {
    return ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
  }

  private fun formatIso(time: Long): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date(time))
  }

  private fun toMap(location: Location) = Arguments.createMap().apply {
    putString("latitude", String.format(Locale.US, "%.7f", location.latitude))
    putString("longitude", String.format(Locale.US, "%.7f", location.longitude))
    putString("accuracy", if (location.hasAccuracy()) String.format(Locale.US, "%.2f", location.accuracy) else null)
    putString("speed", if (location.hasSpeed()) String.format(Locale.US, "%.2f", location.speed) else null)
    putString("recordedAt", formatIso(location.time))
  }
}
