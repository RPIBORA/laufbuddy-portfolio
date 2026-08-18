package app.laufbuddy

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.PhoneStateListener
import android.telephony.ServiceState
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class CellularServiceStateModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private var phoneStateListener: PhoneStateListener? = null

  override fun getName(): String = "CellularServiceStateModule"

  @ReactMethod
  fun startMonitoring(promise: Promise) {
    try {
      if (!hasPhoneStatePermission()) {
        Log.w(TAG, "READ_PHONE_STATE fehlt, Mobilfunknetz-Listener nicht gestartet")
        emitServiceState(null, "permission_missing", "permission_missing")
        promise.resolve(false)
        return
      }

      val telephonyManager =
        reactContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

      if (phoneStateListener == null) {
        phoneStateListener = object : PhoneStateListener() {
          override fun onServiceStateChanged(serviceState: ServiceState?) {
            super.onServiceStateChanged(serviceState)
            emitServiceState(serviceState, "onServiceStateChanged", null)
          }
        }

        telephonyManager.listen(
          phoneStateListener,
          PhoneStateListener.LISTEN_SERVICE_STATE,
        )

        Log.i(TAG, "Mobilfunknetz-Listener gestartet")
      }

      emitServiceState(readCurrentServiceState(telephonyManager), "startMonitoring", null)
      promise.resolve(true)
    } catch (error: Exception) {
      Log.e(TAG, "Mobilfunknetz-Listener Start fehlgeschlagen", error)
      emitServiceState(null, "start_error", error.message)
      promise.reject("CELLULAR_SERVICE_STATE_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stopMonitoring(promise: Promise) {
    try {
      val telephonyManager =
        reactContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

      phoneStateListener?.let {
        telephonyManager.listen(it, PhoneStateListener.LISTEN_NONE)
      }

      phoneStateListener = null
      Log.i(TAG, "Mobilfunknetz-Listener gestoppt")
      promise.resolve(true)
    } catch (error: Exception) {
      Log.e(TAG, "Mobilfunknetz-Listener Stop fehlgeschlagen", error)
      promise.reject("CELLULAR_SERVICE_STATE_STOP_FAILED", error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun hasPhoneStatePermission(): Boolean {
    return ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.READ_PHONE_STATE,
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun readCurrentServiceState(
    telephonyManager: TelephonyManager,
  ): ServiceState? {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        telephonyManager.serviceState
      } else {
        null
      }
    } catch (securityError: SecurityException) {
      Log.w(TAG, "Aktueller Mobilfunkstatus nicht lesbar: READ_PHONE_STATE fehlt")
      null
    }
  }

  private fun emitServiceState(
    serviceState: ServiceState?,
    source: String,
    errorMessage: String?,
  ) {
    val state = serviceState?.state ?: UNKNOWN_STATE
    val hasCellService = state == ServiceState.STATE_IN_SERVICE

    val payload = Arguments.createMap().apply {
      putBoolean("hasCellService", hasCellService)
      putString("state", stateToName(state))
      putString("source", source)
      putString("errorMessage", errorMessage)
    }

    Log.i(TAG, "Mobilfunkstatus: hasCellService=$hasCellService state=${stateToName(state)} source=$source")

    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, payload)
  }

  private fun stateToName(state: Int): String {
    return when (state) {
      ServiceState.STATE_IN_SERVICE -> "in_service"
      ServiceState.STATE_OUT_OF_SERVICE -> "out_of_service"
      ServiceState.STATE_POWER_OFF -> "power_off"
      ServiceState.STATE_EMERGENCY_ONLY -> "emergency_only"
      UNKNOWN_STATE -> "unknown"
      else -> "unknown_$state"
    }
  }

  companion object {
    private const val TAG = "CellularServiceStateModule"
    private const val EVENT_NAME = "LaufBuddyCellularServiceStateChanged"
    private const val UNKNOWN_STATE = -1
  }
}
