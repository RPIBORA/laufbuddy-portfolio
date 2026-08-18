package app.laufbuddy

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class HeadphoneConnectionModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private val audioManager: AudioManager =
    reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private var lastKnownConnectedState: Boolean? = null

  private val audioDeviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      publishCurrentStateIfChanged()
    }

    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
      publishCurrentStateIfChanged()
    }
  }

  override fun getName(): String {
    return "HeadphoneConnectionModule"
  }

  override fun initialize() {
    super.initialize()

    registerAudioDeviceCallback()
    lastKnownConnectedState = getCurrentHeadphoneConnectedState()
  }

  override fun invalidate() {
    unregisterAudioDeviceCallback()
    super.invalidate()
  }

  @ReactMethod
  fun getCurrentHeadphoneState(promise: Promise) {
    try {
      val isConnected = getCurrentHeadphoneConnectedState()
      lastKnownConnectedState = isConnected
      promise.resolve(createStatePayload(isConnected))
    } catch (error: Exception) {
      promise.reject(
        "HEADPHONE_STATE_READ_FAILED",
        "Headset-Status konnte nicht gelesen werden.",
        error
      )
    }
  }

  private fun registerAudioDeviceCallback() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      audioManager.registerAudioDeviceCallback(
        audioDeviceCallback,
        Handler(Looper.getMainLooper())
      )
    }
  }

  private fun unregisterAudioDeviceCallback() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
    }
  }

  private fun publishCurrentStateIfChanged() {
    val isConnected = getCurrentHeadphoneConnectedState()

    if (lastKnownConnectedState == isConnected) {
      return
    }

    lastKnownConnectedState = isConnected
    emitHeadphoneStateChanged(isConnected)
  }

  private fun emitHeadphoneStateChanged(isConnected: Boolean) {
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }

    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, createStatePayload(isConnected))
  }

  private fun createStatePayload(isConnected: Boolean) =
    Arguments.createMap().apply {
      putBoolean("connected", isConnected)
    }

  private fun getCurrentHeadphoneConnectedState(): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val outputDevices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)

      return outputDevices.any { device ->
        isSupportedHeadphoneOutput(device)
      }
    }

    @Suppress("DEPRECATION")
    return audioManager.isWiredHeadsetOn ||
      audioManager.isBluetoothA2dpOn ||
      audioManager.isBluetoothScoOn
  }

  private fun isSupportedHeadphoneOutput(device: AudioDeviceInfo): Boolean {
    return when (device.type) {
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_USB_HEADSET -> true

      else -> {
        if (
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
          device.type == AudioDeviceInfo.TYPE_HEARING_AID
        ) {
          return true
        }

        if (
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
          device.type == AudioDeviceInfo.TYPE_BLE_HEADSET
        ) {
          return true
        }

        false
      }
    }
  }

  companion object {
    const val EVENT_NAME = "headphoneConnectionChanged"
  }
}