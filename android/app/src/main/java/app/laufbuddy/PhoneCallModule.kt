package app.laufbuddy

import android.Manifest
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.display.DisplayManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.view.Display
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PhoneCallModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName(): String {
    return "PhoneCallModule"
  }

  @ReactMethod
  fun getFullScreenIntentAccessStatus(promise: Promise) {
    val required = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
    val granted = !required || (
      reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ).canUseFullScreenIntent()

    promise.resolve(Arguments.createMap().apply {
      putBoolean("required", required)
      putBoolean("granted", granted)
    })
  }

  @ReactMethod
  fun openFullScreenIntentSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      promise.resolve(false)
      return
    }

    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
        Uri.parse("package:${reactApplicationContext.packageName}"),
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      Log.e(TAG, "Vollbildbenachrichtigungs-Einstellung konnte nicht geöffnet werden", error)
      promise.reject(
        "OPEN_FULL_SCREEN_INTENT_SETTINGS_FAILED",
        "Die Android-Einstellung für Vollbildbenachrichtigungen konnte nicht geöffnet werden.",
        error,
      )
    }
  }

  @ReactMethod
  fun startDirectCall(phoneNumber: String, promise: Promise) {
    Log.i(TAG, "startDirectCall angefordert")

    val normalizedPhoneNumber = normalizePhoneNumber(phoneNumber)

    if (normalizedPhoneNumber.isEmpty()) {
      Log.e(TAG, "Nummer ungültig")
      promise.reject("INVALID_PHONE_NUMBER", "Ungültige Nummer")
      return
    }

    val context = reactApplicationContext

    val hasCallPermission = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.CALL_PHONE,
    ) == PackageManager.PERMISSION_GRANTED

    Log.i(TAG, "CALL_PHONE erlaubt: $hasCallPermission")

    if (!hasCallPermission) {
      promise.reject(
        "CALL_PHONE_PERMISSION_MISSING",
        "CALL_PHONE fehlt",
      )
      return
    }

    val startRequestAtElapsedMs = SystemClock.elapsedRealtime()
    val traceId = "notfall-$startRequestAtElapsedMs"
    val isAppVisible = MainApplication.isAppVisible()
    val shouldStartDirectActivity = shouldStartEmergencyActivityDirectly(context)
    val selectedStartPath = if (shouldStartDirectActivity) "directActivity" else "fullScreenIntent"

    logEmergencyDeviceSnapshot(
      context = context,
      traceId = traceId,
      startPath = selectedStartPath,
      startReason = "startDirectCall",
      hasTargetPhoneNumber = normalizedPhoneNumber.isNotBlank(),
    )

    Log.i(TAG, "[$traceId] App sichtbar vor Notfallstart: $isAppVisible")
    Log.i(TAG, "[$traceId] Gewählter Notfall-Startweg: $selectedStartPath")

    try {
      wakeScreenForEmergency(context, traceId)

      if (shouldStartDirectActivity) {
        Log.i(TAG, "[$traceId] Gerät ist wach und entsperrt, EmergencyCallActivity wird direkt gestartet")

        startEmergencyCallActivity(
          context = context,
          phoneNumber = normalizedPhoneNumber,
          traceId = traceId,
        )

        scheduleSingleVerifiedEmergencyFallback(
          context = context,
          phoneNumber = normalizedPhoneNumber,
          traceId = traceId,
          startRequestAtElapsedMs = startRequestAtElapsedMs,
          delayMs = VERIFIED_FALLBACK_DELAY_MS,
        )
      } else {
        Log.i(TAG, "[$traceId] Gerät ist nicht direkt startbereit, FullScreenIntent wird als Hauptweg genutzt")

        LaufBuddyForegroundService.triggerEmergency(
          context,
          normalizedPhoneNumber,
        )

        scheduleFullScreenIntentDirectStartFallback(
          context = context,
          phoneNumber = normalizedPhoneNumber,
          traceId = traceId,
          startRequestAtElapsedMs = startRequestAtElapsedMs,
          delayMs = 2500L,
        )

        scheduleEmergencyStartObservation(
          traceId = traceId,
          startRequestAtElapsedMs = startRequestAtElapsedMs,
        )
      }

      promise.resolve(null)
    } catch (startError: Exception) {
      Log.e(
        TAG,
        "[$traceId] Notfallstart über gewählten Hauptweg fehlgeschlagen, versuche einmalig FullScreenIntent",
        startError,
      )

      try {
        wakeScreenForEmergency(context, traceId)

        LaufBuddyForegroundService.triggerEmergency(
          context,
          normalizedPhoneNumber,
        )

        scheduleFullScreenIntentDirectStartFallback(
          context = context,
          phoneNumber = normalizedPhoneNumber,
          traceId = traceId,
          startRequestAtElapsedMs = startRequestAtElapsedMs,
          delayMs = 2500L,
        )

        scheduleEmergencyStartObservation(
          traceId = traceId,
          startRequestAtElapsedMs = startRequestAtElapsedMs,
        )

        promise.resolve(null)
      } catch (fallbackError: Exception) {
        Log.e(TAG, "[$traceId] Notfall konnte auch per FullScreenIntent nicht gestartet werden", fallbackError)
        promise.reject("DIRECT_CALL_FAILED", fallbackError.message)
      }
    }
  }

  @ReactMethod
  fun openDialer(phoneNumber: String, promise: Promise) {
    Log.i(TAG, "openDialer angefordert")

    val normalizedPhoneNumber = normalizePhoneNumber(phoneNumber)

    if (normalizedPhoneNumber.isEmpty()) {
      Log.e(TAG, "Nummer ungültig")
      promise.reject("INVALID_PHONE_NUMBER", "Ungültige Nummer")
      return
    }

    try {
      val intent = Intent(Intent.ACTION_DIAL).apply {
        data = Uri.parse("tel:$normalizedPhoneNumber")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      reactApplicationContext.startActivity(intent)

      Log.i(TAG, "Dialer geöffnet")
      promise.resolve(null)
    } catch (error: Exception) {
      Log.e(TAG, "Dialer konnte nicht geöffnet werden", error)
      promise.reject("OPEN_DIALER_FAILED", error.message)
    }
  }

  @Suppress("DEPRECATION")
  private fun wakeScreenForEmergency(
    context: Context,
    traceId: String,
  ) {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

    val wakeLock = powerManager.newWakeLock(
      PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
        PowerManager.ACQUIRE_CAUSES_WAKEUP or
        PowerManager.ON_AFTER_RELEASE,
      "$TAG:EmergencyWakeLock",
    )

    wakeLock.acquire(5000L)

    Log.i(TAG, "[$traceId] WakeLock für Notfallstart ausgelöst")
  }

  private fun startEmergencyCallActivity(
    context: Context,
    phoneNumber: String,
    traceId: String,
  ) {
    val intent = Intent(context, EmergencyCallActivity::class.java).apply {
      putExtra(EmergencyCallActivity.EXTRA_PHONE_NUMBER, phoneNumber)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    context.startActivity(intent)

    Log.i(TAG, "[$traceId] EmergencyCallActivity startActivity-Aufruf abgesetzt, echte Startbestätigung steht noch aus")
  }

  private fun scheduleSingleVerifiedEmergencyFallback(
    context: Context,
    phoneNumber: String,
    traceId: String,
    startRequestAtElapsedMs: Long,
    delayMs: Long,
  ) {
    mainHandler.postDelayed({
      if (EmergencyCallActivity.hasStartedAfter(startRequestAtElapsedMs)) {
        Log.i(TAG, "[$traceId] EmergencyCallActivity Start bestätigt, kein FullScreenIntent-Fallback nötig nach ${delayMs}ms")
        return@postDelayed
      }

      Log.w(TAG, "[$traceId] EmergencyCallActivity nicht bestätigt nach ${delayMs}ms, einmaliger FullScreenIntent-Fallback wird ausgelöst")

      try {
        wakeScreenForEmergency(context, traceId)

        LaufBuddyForegroundService.triggerEmergency(
          context,
          phoneNumber,
        )

        scheduleEmergencyStartObservation(
          traceId = traceId,
          startRequestAtElapsedMs = startRequestAtElapsedMs,
        )
      } catch (fallbackError: Exception) {
        Log.e(TAG, "[$traceId] Einmaliger FullScreenIntent-Fallback fehlgeschlagen nach ${delayMs}ms", fallbackError)
      }
    }, delayMs)
  }


  private fun scheduleFullScreenIntentDirectStartFallback(
    context: Context,
    phoneNumber: String,
    traceId: String,
    startRequestAtElapsedMs: Long,
    delayMs: Long,
  ) {
    mainHandler.postDelayed({
      if (EmergencyCallActivity.hasStartedAfter(startRequestAtElapsedMs)) {
        Log.i(TAG, "[$traceId] EmergencyCallActivity Start durch FullScreenIntent bestätigt, kein direkter Nachstart nötig")
        return@postDelayed
      }

      Log.w(TAG, "[$traceId] FullScreenIntent hat EmergencyCallActivity nach ${delayMs}ms nicht gestartet, EmergencyCallActivity wird direkt nachgestartet")

      try {
        wakeScreenForEmergency(context, traceId)

        startEmergencyCallActivity(
          context = context,
          phoneNumber = phoneNumber,
          traceId = traceId,
        )
      } catch (directStartError: Exception) {
        Log.e(TAG, "[$traceId] Direkter EmergencyCallActivity-Nachstart fehlgeschlagen", directStartError)
      }
    }, delayMs)
  }

  private fun scheduleEmergencyStartObservation(
    traceId: String,
    startRequestAtElapsedMs: Long,
  ) {
    EMERGENCY_START_OBSERVATION_DELAYS_MS.forEach { delayMs ->
      mainHandler.postDelayed({
        val activityStarted = EmergencyCallActivity.hasStartedAfter(startRequestAtElapsedMs)

        if (activityStarted) {
          Log.i(TAG, "[$traceId] EmergencyCallActivity Start bestätigt nach ${delayMs}ms")
          return@postDelayed
        }

        if (delayMs >= CRITICAL_START_OBSERVATION_DELAY_MS) {
          Log.e(TAG, "[$traceId] EmergencyCallActivity Start nach ${delayMs}ms weiterhin nicht bestätigt")
        } else {
          Log.w(TAG, "[$traceId] EmergencyCallActivity Start nach ${delayMs}ms noch nicht bestätigt")
        }
      }, delayMs)
    }
  }

  private fun shouldStartEmergencyActivityDirectly(context: Context): Boolean {
    // LaufBuddy Notfallregel:
    // hilfe -> FullScreenIntent -> EmergencyCallActivity -> ACTION_CALL
    // Kein direkter Activity-Sonderweg, damit der Anrufstart in jedem App-/Screen-Zustand gleich läuft.
    return false
  }

  private fun logEmergencyDeviceSnapshot(
    context: Context,
    traceId: String,
    startPath: String,
    startReason: String,
    hasTargetPhoneNumber: Boolean,
  ) {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager

    val appVisible = MainApplication.isAppVisible()
    val screenOn = isAnyDisplayOn(context)
    val interactive = powerManager.isInteractive
    val keyguardLocked = keyguardManager.isKeyguardLocked
    val deviceLocked = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      keyguardManager.isDeviceLocked
    } else {
      keyguardLocked
    }
    val powerSaveMode = powerManager.isPowerSaveMode
    val callPermissionGranted = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.CALL_PHONE,
    ) == PackageManager.PERMISSION_GRANTED
    val recordAudioPermissionGranted = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.RECORD_AUDIO,
    ) == PackageManager.PERMISSION_GRANTED
    val notificationPermissionGranted = isNotificationPermissionGranted(context)

    Log.i(
      TAG,
      "[$traceId] Notfall-Sicherheitsprotokoll: " +
        "startReason=$startReason, " +
        "startPath=$startPath, " +
        "hasTargetPhoneNumber=$hasTargetPhoneNumber, " +
        "appVisible=$appVisible, " +
        "screenOn=$screenOn, " +
        "interactive=$interactive, " +
        "keyguardLocked=$keyguardLocked, " +
        "deviceLocked=$deviceLocked, " +
        "powerSaveMode=$powerSaveMode, " +
        "callPermissionGranted=$callPermissionGranted, " +
        "recordAudioPermissionGranted=$recordAudioPermissionGranted, " +
        "notificationPermissionGranted=$notificationPermissionGranted",
    )
  }

  private fun isAnyDisplayOn(context: Context): Boolean {
    val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager

    return displayManager.displays.any { display ->
      display.state == Display.STATE_ON
    }
  }

  private fun isNotificationPermissionGranted(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return true
    }

    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun normalizePhoneNumber(value: String): String {
    val trimmedValue = value.trim()

    if (trimmedValue.isEmpty()) {
      return ""
    }

    val digitsAndPlusOnly = trimmedValue.replace(Regex("[^\\d+]"), "")

    if (digitsAndPlusOnly.isEmpty()) {
      return ""
    }

    return if (!digitsAndPlusOnly.startsWith("+")) {
      digitsAndPlusOnly.replace("+", "")
    } else {
      val withoutExtraPlus = digitsAndPlusOnly.substring(1).replace("+", "")
      "+$withoutExtraPlus"
    }
  }

  companion object {
    private const val TAG = "PhoneCallModule"
    private const val VERIFIED_FALLBACK_DELAY_MS = 3000L
    private const val CRITICAL_START_OBSERVATION_DELAY_MS = 20000L

    private val EMERGENCY_START_OBSERVATION_DELAYS_MS = listOf(
      3000L,
      10000L,
      CRITICAL_START_OBSERVATION_DELAY_MS,
    )
  }
}
