package app.laufbuddy

import android.content.Context
import android.os.Handler
import android.util.Log

/**
 * Compatibility facade for the microphone service.  The durable emergency
 * record and all execution live in [NativeEmergencyCallStore] / WorkManager;
 * this object deliberately owns no pending state and therefore may disappear
 * when the hotword service is stopped.
 */
class NativeEmergencyCallCoordinator(
  context: Context,
  @Suppress("UNUSED_PARAMETER") handler: Handler,
  @Suppress("UNUSED_PARAMETER") onLaunchRequested: (String) -> Unit,
  private val onStatusChanged: (Status) -> Unit,
) {
  enum class Status { Idle, WaitingForConnectivity, Launching, MissingPrimaryContact, MissingCallPermission, MissingPhoneStatePermission }

  private val appContext = context.applicationContext
  private var started = false

  fun start() {
    started = true
    NativeEmergencyCallStore.repairAndEnqueue(appContext)
    publishCurrentStatus()
  }

  fun stop() { started = false }

  /** Returns only after the immutable phone snapshot was committed. */
  fun queueHelpEmergency(): Boolean {
    val queued = NativeEmergencyCallStore.createOrReusePendingFromHotwordContact(appContext)
    if (!queued) {
      onStatusChanged(Status.MissingPrimaryContact)
      return false
    }
    NativeEmergencyCallStore.repairAndEnqueue(appContext)
    onStatusChanged(Status.Launching)
    return true
  }

  fun evaluate(reason: String) {
    Log.i(TAG, "Notrufstatus wird geprüft: $reason")
    NativeEmergencyCallStore.repairAndEnqueue(appContext)
    publishCurrentStatus()
  }

  private fun publishCurrentStatus() {
    if (!started) return
    onStatusChanged(
      if (NativeEmergencyCallStore.hasActiveRequest(appContext)) Status.WaitingForConnectivity else Status.Idle,
    )
  }

  companion object {
    private const val TAG = "NativeEmergencyCall"
    fun syncPrimaryContact(context: Context, phoneNumber: String?) =
      NativeEmergencyCallStore.syncPrimaryContact(context, phoneNumber)

    fun syncTemporaryLiveBuddyContact(context: Context, phoneNumber: String?) =
      NativeEmergencyCallStore.syncTemporaryLiveBuddyContact(phoneNumber)
  }
}
