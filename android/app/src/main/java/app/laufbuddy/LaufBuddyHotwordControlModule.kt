package app.laufbuddy

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class LaufBuddyHotwordControlModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  init {
    activeReactContext = reactContext
    NativeEmergencyCallCoordinator.syncTemporaryLiveBuddyContact(
      reactContext,
      null,
    )
  }

  override fun getName(): String {
    return "LaufBuddyHotwordControlModule"
  }

  @ReactMethod
  fun refreshHotwordState(promise: Promise) {
    try {
      val status = LaufBuddyForegroundService.refreshHotwordState(
        reactApplicationContext
      )

      promise.resolve(Arguments.createMap().apply {
        putBoolean("active", status.active)
        putString("reason", status.reason)
      })
    } catch (error: Exception) {
      promise.reject(
        "HOTWORD_REFRESH_FAILED",
        error.message ?: "Hotword-Status konnte nicht aktualisiert werden.",
      )
    }
  }

  @ReactMethod
  fun getHotwordStatus(promise: Promise) {
    val status = LaufBuddyForegroundService.currentHotwordStatus()
    promise.resolve(Arguments.createMap().apply {
      putBoolean("active", status.active)
      putString("reason", status.reason)
    })
  }

  @ReactMethod
  fun setHotwordEnabledForCurrentRun(enabled: Boolean, promise: Promise) {
    try {
      val status = LaufBuddyForegroundService.setHotwordEnabledForCurrentRun(
        reactApplicationContext,
        enabled,
      )
      promise.resolve(Arguments.createMap().apply {
        putBoolean("active", status.active)
        putString("reason", status.reason)
      })
    } catch (error: Exception) {
      promise.reject(
        "RUN_HOTWORD_SETTING_FAILED",
        error.message ?: "Hotword-Einstellung für den Lauf konnte nicht übernommen werden.",
      )
    }
  }

  @ReactMethod
  fun syncPrimaryEmergencyContact(
    phoneNumber: String?,
    promise: Promise,
  ) {
    try {
      NativeEmergencyCallCoordinator.syncPrimaryContact(
        reactApplicationContext,
        phoneNumber,
      )

      LaufBuddyForegroundService.refreshEmergencyState(
        reactApplicationContext
      )

      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "EMERGENCY_CONTACT_SYNC_FAILED",
        error.message
          ?: "Telefonkontakt konnte nicht nativ synchronisiert werden.",
      )
    }
  }

  @ReactMethod
  fun syncTemporaryLiveBuddyContact(
    phoneNumber: String?,
    promise: Promise,
  ) {
    try {
      NativeEmergencyCallCoordinator.syncTemporaryLiveBuddyContact(
        reactApplicationContext,
        phoneNumber,
      )

      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "LIVE_BUDDY_CONTACT_SYNC_FAILED",
        error.message
          ?: "Temporärer LiveBuddy konnte nicht nativ synchronisiert werden.",
      )
    }
  }

  @ReactMethod
  fun pauseHotwordForWebRtc(promise: Promise) {
    try {
      val status = LaufBuddyForegroundService.pauseHotwordForWebRtc(
        reactApplicationContext
      )

      promise.resolve(Arguments.createMap().apply {
        putBoolean("active", status.active)
        putString("reason", status.reason)
      })
    } catch (error: Exception) {
      promise.reject(
        "HOTWORD_PAUSE_FAILED",
        error.message ?: "Hotword konnte für WebRTC nicht pausiert werden.",
      )
    }
  }

  @ReactMethod
  fun resumeHotwordAfterWebRtc(promise: Promise) {
    try {
      val status = LaufBuddyForegroundService.resumeHotwordAfterWebRtc(
        reactApplicationContext
      )

      promise.resolve(Arguments.createMap().apply {
        putBoolean("active", status.active)
        putString("reason", status.reason)
      })
    } catch (error: Exception) {
      promise.reject(
        "HOTWORD_RESUME_FAILED",
        error.message
          ?: "Hotword konnte nach WebRTC nicht wieder gestartet werden.",
      )
    }
  }

  companion object {
    const val EVENT_NATIVE_HOTWORD_DETECTED =
      "laufBuddyNativeHotwordDetected"
    const val EVENT_NATIVE_HOTWORD_STATUS =
      "laufBuddyNativeHotwordStatus"
    const val EVENT_NATIVE_EMERGENCY_CALL_DISPATCHED =
      "laufBuddyNativeEmergencyCallDispatched"

    private const val TAG = "LaufBuddyHotwordBridge"

    @Volatile
    private var activeReactContext: ReactApplicationContext? = null

    fun emitNativeHotwordDetected(hotword: String) {
      val reactContext = activeReactContext

      if (reactContext == null) {
        Log.w(
          TAG,
          "emitNativeHotwordDetected: kein ReactContext verfügbar"
        )

        return
      }

      if (!reactContext.hasActiveReactInstance()) {
        Log.w(
          TAG,
          "emitNativeHotwordDetected: ReactInstance nicht aktiv"
        )

        return
      }

      val payload = Arguments.createMap().apply {
        putString("hotword", hotword)
        putDouble(
          "detectedAtMs",
          System.currentTimeMillis().toDouble(),
        )
      }

      try {
        reactContext
          .getJSModule(
            DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
          )
          .emit(EVENT_NATIVE_HOTWORD_DETECTED, payload)

        Log.i(
          TAG,
          "emitNativeHotwordDetected: Event gesendet, hotword=$hotword"
        )
      } catch (error: Exception) {
        Log.e(
          TAG,
          "emitNativeHotwordDetected: Event konnte nicht gesendet werden",
          error,
        )
      }
    }

    fun emitNativeEmergencyCallDispatched() {
      val reactContext = activeReactContext

      if (reactContext == null || !reactContext.hasActiveReactInstance()) {
        Log.w(
          TAG,
          "emitNativeEmergencyCallDispatched: kein aktiver ReactContext verfügbar"
        )
        return
      }

      val payload = Arguments.createMap().apply {
        putDouble(
          "dispatchedAtMs",
          System.currentTimeMillis().toDouble(),
        )
      }

      try {
        reactContext
          .getJSModule(
            DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
          )
          .emit(EVENT_NATIVE_EMERGENCY_CALL_DISPATCHED, payload)

        Log.i(
          TAG,
          "emitNativeEmergencyCallDispatched: Event gesendet"
        )
      } catch (error: Exception) {
        Log.e(
          TAG,
          "emitNativeEmergencyCallDispatched: Event konnte nicht gesendet werden",
          error,
        )
      }
    }

    fun emitNativeHotwordStatus(active: Boolean, reason: String) {
      val reactContext = activeReactContext ?: return
      if (!reactContext.hasActiveReactInstance()) return

      try {
        reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_NATIVE_HOTWORD_STATUS, Arguments.createMap().apply {
            putBoolean("active", active)
            putString("reason", reason)
          })
      } catch (error: Exception) {
        Log.e(TAG, "emitNativeHotwordStatus: Event konnte nicht gesendet werden", error)
      }
    }
  }
}
