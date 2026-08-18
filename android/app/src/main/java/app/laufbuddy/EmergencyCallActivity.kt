package app.laufbuddy

import android.Manifest
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.telecom.TelecomManager
import android.util.Log
import android.view.WindowManager
import androidx.core.content.ContextCompat

class EmergencyCallActivity : Activity() {

  private var callStartScheduled = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    Log.i(TAG, "onCreate gestartet")
    markEmergencyCallActivityStarted("onCreate")

    prepareWindowForEmergencyCall()
    handleEmergencyCallIntent(intent, "onCreate")
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)

    Log.i(TAG, "onNewIntent gestartet")
    markEmergencyCallActivityStarted("onNewIntent")

    setIntent(intent)
    prepareWindowForEmergencyCall()
    handleEmergencyCallIntent(intent, "onNewIntent")
  }

  override fun onResume() {
    super.onResume()
    Log.i(TAG, "onResume")
  }

  override fun onDestroy() {
    Log.i(TAG, "onDestroy")
    super.onDestroy()
  }

  private fun prepareWindowForEmergencyCall() {
    showOverLockScreen()
    dismissKeyguardIfPossible()
  }

  private fun handleEmergencyCallIntent(
    sourceIntent: Intent?,
    source: String,
  ) {
    val phoneNumber = sourceIntent?.getStringExtra(EXTRA_PHONE_NUMBER) ?: ""

    Log.i(TAG, "phoneNumber vorhanden aus $source: ${phoneNumber.isNotBlank()}")

    if (phoneNumber.isBlank()) {
      Log.e(TAG, "abgebrochen: phoneNumber leer aus $source")
      finish()
      return
    }

    scheduleDirectCall(phoneNumber, source)
  }

  private fun scheduleDirectCall(
    phoneNumber: String,
    source: String,
  ) {
    if (callStartScheduled) {
      Log.w(TAG, "Direktanruf bereits geplant, ueberspringe doppelten Start aus $source")
      return
    }

    callStartScheduled = true

    window.decorView.postDelayed({
      callStartScheduled = false

      Log.i(TAG, "postDelayed erreicht aus $source, starte Direktanruf")
      startDirectCall(phoneNumber)
      Log.i(TAG, "Activity bleibt kurz offen nach startDirectCall")

      window.decorView.postDelayed({
        Log.i(TAG, "finish nach Wartezeit")
        finish()
      }, 3000)
    }, 1200)
  }

  private fun showOverLockScreen() {
    Log.i(TAG, "showOverLockScreen")

    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      Log.i(TAG, "setShowWhenLocked + setTurnScreenOn")
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
  }

  private fun dismissKeyguardIfPossible() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      Log.i(TAG, "dismissKeyguard uebersprungen: Android < O")
      return
    }

    Log.i(TAG, "requestDismissKeyguard wird versucht")

    val keyguardManager =
      getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager

    keyguardManager.requestDismissKeyguard(this, null)
  }

  private fun startDirectCall(phoneNumber: String) {
    val normalizedPhoneNumber = normalizePhoneNumber(phoneNumber)

    if (normalizedPhoneNumber.isEmpty()) {
      Log.e(TAG, "abgebrochen: normalisierte Nummer leer")

      return
    }

    val hasCallPermission = ContextCompat.checkSelfPermission(
      this,
      Manifest.permission.CALL_PHONE,
    ) == PackageManager.PERMISSION_GRANTED

    Log.i(TAG, "CALL_PHONE erlaubt: $hasCallPermission")

    if (!hasCallPermission) {
      Log.e(TAG, "abgebrochen: CALL_PHONE fehlt")

      return
    }

    try {
      val telecom = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      telecom.placeCall(Uri.fromParts("tel", normalizedPhoneNumber, null), Bundle())
      Log.i(TAG, "TelecomManager.placeCall erfolgreich aufgerufen")
    } catch (error: Exception) {
      Log.e(TAG, "ACTION_CALL fehlgeschlagen", error)

    }
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
    private const val TAG = "EmergencyCallActivity"
    const val EXTRA_PHONE_NUMBER = "phone_number"

    @Volatile
    private var lastStartedAtElapsedMs = 0L

    fun markEmergencyCallActivityStarted(source: String) {
      lastStartedAtElapsedMs = SystemClock.elapsedRealtime()
      Log.i(TAG, "EmergencyCallActivity Start bestätigt aus $source: $lastStartedAtElapsedMs")
    }

    fun hasStartedAfter(startRequestAtElapsedMs: Long): Boolean {
      return lastStartedAtElapsedMs >= startRequestAtElapsedMs
    }
  }
}
