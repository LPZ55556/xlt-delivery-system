package com.xlt.delivery

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.os.Build
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.charset.Charset
import java.util.UUID

class XltPrinterModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "XltPrinter"
  private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

  @ReactMethod
  fun listBondedDevices(promise: Promise) {
    try {
      if (!hasBluetoothConnectPermission()) { promise.reject("BLUETOOTH_PERMISSION_DENIED", "Bluetooth permission is not granted."); return }
      val adapter = BluetoothAdapter.getDefaultAdapter()
      if (adapter == null) { promise.resolve(Arguments.createArray()); return }
      val devices = Arguments.createArray()
      adapter.bondedDevices?.forEach { device ->
        val map = Arguments.createMap()
        map.putString("name", safeName(device))
        map.putString("address", device.address)
        devices.pushMap(map)
      }
      promise.resolve(devices)
    } catch (error: Exception) { promise.reject("BLUETOOTH_LIST_FAILED", error.message, error) }
  }

  @ReactMethod
  fun printText(address: String, text: String, promise: Promise) {
    Thread {
      try {
        if (!hasBluetoothConnectPermission()) { promise.reject("BLUETOOTH_PERMISSION_DENIED", "Bluetooth permission is not granted."); return@Thread }
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: throw IllegalStateException("Bluetooth adapter unavailable")
        val device = adapter.getRemoteDevice(address)
        adapter.cancelDiscovery()
        val socket = device.createRfcommSocketToServiceRecord(sppUuid)
        socket.connect()
        socket.outputStream.use { output ->
          output.write(byteArrayOf(0x1B, 0x40))
          output.write(text.toByteArray(Charset.forName("GBK")))
          output.write(byteArrayOf(0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00))
          output.flush()
        }
        socket.close()
        promise.resolve(true)
      } catch (error: Exception) { promise.reject("BLUETOOTH_PRINT_FAILED", error.message, error) }
    }.start()
  }

  private fun hasBluetoothConnectPermission(): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
  }

  private fun safeName(device: BluetoothDevice): String = try { device.name ?: "未命名设备" } catch (_: SecurityException) { "未命名设备" }
}
