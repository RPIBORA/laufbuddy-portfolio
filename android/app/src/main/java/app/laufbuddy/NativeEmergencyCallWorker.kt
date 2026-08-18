package app.laufbuddy

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.telecom.TelecomManager
import android.telephony.ServiceState
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.Worker
import androidx.work.WorkerParameters

/** Persistent retry engine.  It never deletes a request on failure. */
class NativeEmergencyCallWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
  override fun doWork(): Result {
    val request = NativeEmergencyCallStore.activeRequest(applicationContext) ?: return Result.success()
    if (request.status == NativeEmergencyCallStore.Status.DISPATCHED) return Result.success()
    if (!has(Manifest.permission.CALL_PHONE)) return waitFor(request, "CALL_PHONE fehlt")
    if (!has(Manifest.permission.READ_PHONE_STATE)) return waitFor(request, "READ_PHONE_STATE fehlt")

    val telephony = applicationContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    if (!telephony.isVoiceCapable) return waitFor(request, "Gerät ist nicht sprachfähig")
    val serviceState = try { telephony.serviceState } catch (error: SecurityException) { return waitFor(request, "Telefonstatus nicht lesbar") }
    if (serviceState == null || serviceState.state != ServiceState.STATE_IN_SERVICE) {
      return waitFor(request, "Mobilfunk-Sprachdienst nicht verfügbar")
    }
    if (telephony.callState != TelephonyManager.CALL_STATE_IDLE) return waitFor(request, "Anderes Telefonat aktiv")

    if (!NativeEmergencyCallStore.markAttempt(applicationContext, request.id, NativeEmergencyCallStore.Status.PLACING)) return Result.retry()
    NativeEmergencyCallStore.showNotification(applicationContext, "Notruf wird ausgeführt")
    return try {
      val telecom = applicationContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      NativeEmergencyCallStore.preferCommunicationHeadset(
        applicationContext,
        "best effort vor Telecom.placeCall",
      )
      telecom.placeCall(Uri.fromParts("tel", request.phoneNumber, null), Bundle())
      // TelecomManager provides no asynchronous acceptance result to a non-default dialer.
      // A non-throwing call is the strongest supported hand-off signal available here.
      NativeEmergencyCallStore.markDispatched(applicationContext, request.id)
      LaufBuddyHotwordControlModule.emitNativeEmergencyCallDispatched()
      Log.i(TAG, "Telecom placeCall übergeben: id=${request.id}")
      Result.success()
    } catch (error: Exception) {
      waitFor(request, "Telecom placeCall fehlgeschlagen: ${error.javaClass.simpleName}")
    }
  }

  private fun waitFor(request: NativeEmergencyCallStore.Request, error: String): Result {
    NativeEmergencyCallStore.markWaiting(applicationContext, request.id, error)
    NativeEmergencyCallStore.showNotification(applicationContext, "Notruf wartet auf Mobilfunknetz")
    Log.w(TAG, "$error; Auftrag bleibt pending: ${request.id}")
    return Result.retry()
  }
  private fun has(permission: String) = ContextCompat.checkSelfPermission(applicationContext, permission) == PackageManager.PERMISSION_GRANTED
  companion object { private const val TAG = "NativeEmergencyWorker" }
}
