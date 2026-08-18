package app.laufbuddy

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.SystemClock
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Device-protected, commit-backed immutable emergency request storage. */
object NativeEmergencyCallStore {
  const val WORK_PREFIX = "laufbuddy-emergency-"
  private const val TAG = "NativeEmergencyStore"
  private const val PREFS = "laufbuddy_native_emergency_v2"
  private const val KEY_PRIMARY = "primary_phone_number"
  private const val KEY_ID = "id"
  private const val KEY_PHONE = "phone_snapshot"
  private const val KEY_CREATED = "created_at_wall_ms"
  private const val KEY_STATUS = "status"
  private const val KEY_ATTEMPTS = "attempts"
  private const val KEY_LAST_ATTEMPT = "last_attempt_wall_ms"
  private const val KEY_ERROR = "last_error"
  private const val KEY_HEADSET = "headset_at_trigger"
  private const val KEY_VERSION = "schema_version"
  private const val SCHEMA_VERSION = 2

  enum class Status { PENDING, WAITING_FOR_SERVICE, PLACING, DISPATCHED }
  data class Request(val id: String, val phoneNumber: String, val status: Status)

  private fun context(context: Context) =
    context.applicationContext.createDeviceProtectedStorageContext()
  private fun prefs(context: Context) = context(context).getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private val lock = Any()
  private var temporaryLiveBuddyPhoneNumber: String? = null

  fun syncPrimaryContact(context: Context, phoneNumber: String?) {
    val normalized = normalize(phoneNumber.orEmpty())
    val editor = prefs(context).edit()
    if (normalized.isEmpty()) editor.remove(KEY_PRIMARY) else editor.putString(KEY_PRIMARY, normalized)
    if (!editor.commit()) Log.e(TAG, "Primärer Kontakt konnte nicht nativ gespeichert werden")
  }

  fun syncTemporaryLiveBuddyContact(phoneNumber: String?) = synchronized(lock) {
    val normalized = normalize(phoneNumber.orEmpty())
    temporaryLiveBuddyPhoneNumber = normalized.ifEmpty { null }
    Log.i(
      TAG,
      if (temporaryLiveBuddyPhoneNumber == null) {
        "Temporärer LiveBuddy wurde nativ gelöscht"
      } else {
        "Temporärer LiveBuddy wurde nativ gesetzt"
      },
    )
  }

  fun createOrReusePendingFromHotwordContact(context: Context): Boolean = synchronized(lock) {
    val preferences = prefs(context)
    val active = loadLocked(preferences)
    if (active != null && active.status != Status.DISPATCHED) return@synchronized true
    val phone = temporaryLiveBuddyPhoneNumber
      ?: normalize(preferences.getString(KEY_PRIMARY, "").orEmpty())
    if (phone.isEmpty()) return@synchronized false
    val id = UUID.randomUUID().toString()
    val committed = preferences.edit()
      .putString(KEY_ID, id).putString(KEY_PHONE, phone)
      .putLong(KEY_CREATED, System.currentTimeMillis()).putString(KEY_STATUS, Status.PENDING.name)
      .putInt(KEY_ATTEMPTS, 0).putLong(KEY_LAST_ATTEMPT, 0L).remove(KEY_ERROR)
      .putBoolean(KEY_HEADSET, hasCommunicationHeadset(context)).putInt(KEY_VERSION, SCHEMA_VERSION)
      .commit()
    if (!committed) {
      Log.e(TAG, "UNSICHER: Notrufauftrag konnte nicht committed werden")
      return@synchronized false
    }
    Log.i(TAG, "Notrufauftrag committed: id=$id")
    showNotification(context, "Notruf wartet auf Mobilfunknetz")
    true
  }

  fun activeRequest(context: Context): Request? = synchronized(lock) { loadLocked(prefs(context)) }
  fun hasActiveRequest(context: Context) = activeRequest(context)?.status != Status.DISPATCHED

  fun markAttempt(context: Context, id: String, status: Status, error: String? = null): Boolean = synchronized(lock) {
    val p = prefs(context); val current = loadLocked(p) ?: return@synchronized false
    if (current.id != id || current.status == Status.DISPATCHED) return@synchronized false
    p.edit().putString(KEY_STATUS, status.name)
      .putInt(KEY_ATTEMPTS, p.getInt(KEY_ATTEMPTS, 0) + 1)
      .putLong(KEY_LAST_ATTEMPT, System.currentTimeMillis())
      .apply { if (error == null) remove(KEY_ERROR) else putString(KEY_ERROR, error.take(512)) }
      .commit()
  }

  fun markWaiting(context: Context, id: String, error: String): Boolean = synchronized(lock) {
    val p = prefs(context); val current = loadLocked(p) ?: return@synchronized false
    if (current.id != id || current.status == Status.DISPATCHED) return@synchronized false
    p.edit().putString(KEY_STATUS, Status.WAITING_FOR_SERVICE.name).putString(KEY_ERROR, error.take(512)).commit()
  }

  fun markDispatched(context: Context, id: String): Boolean = synchronized(lock) {
    val p = prefs(context); val current = loadLocked(p) ?: return@synchronized false
    if (current.id != id || current.status == Status.DISPATCHED) return@synchronized false
    val committed = p.edit().putString(KEY_STATUS, Status.DISPATCHED.name).remove(KEY_ERROR).commit()
    if (committed) cancelNotification(context)
    committed
  }

  fun repairAndEnqueue(context: Context) {
    val request = activeRequest(context) ?: return
    if (request.status == Status.DISPATCHED) return
    showNotification(context, if (request.status == Status.PLACING) "Notruf wird ausgeführt" else "Notruf wartet auf Mobilfunknetz")
    val work = OneTimeWorkRequestBuilder<NativeEmergencyCallWorker>()
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .addTag(WORK_PREFIX + request.id).build()
    WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(WORK_PREFIX + request.id, ExistingWorkPolicy.KEEP, work)
  }

  fun showNotification(context: Context, text: String) = NativeEmergencyNotification.show(context, text)
  fun cancelNotification(context: Context) = NativeEmergencyNotification.cancel(context)

  fun hasCommunicationHeadset(context: Context): Boolean {
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val devices: List<AudioDeviceInfo> = if (android.os.Build.VERSION.SDK_INT >= 31) {
      audio.availableCommunicationDevices
    } else {
      audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
    }
    return devices.any { isCommunicationHeadsetType(it.type) }
  }

  /** Prefer a connected call-capable headset without ever forcing speakerphone. */
  fun preferCommunicationHeadset(context: Context, reason: String): Boolean {
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val devices: List<AudioDeviceInfo> = if (android.os.Build.VERSION.SDK_INT >= 31) {
      audio.availableCommunicationDevices
    } else {
      audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
    }
    val headset = devices.firstOrNull { isCommunicationHeadsetType(it.type) }
    if (headset == null) {
      Log.i(TAG, "Kommunikationsroute: kein Headset verfügbar, Handy-Fallback: $reason")
      clearCommunicationDeviceForHandset(context)
      return false
    }

    val selected = if (android.os.Build.VERSION.SDK_INT >= 31) {
      audio.setCommunicationDevice(headset)
    } else if (headset.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
      @Suppress("DEPRECATION")
      audio.startBluetoothSco()
      true
    } else {
      true
    }
    val appCommunicationDevice = if (android.os.Build.VERSION.SDK_INT >= 31) {
      audio.communicationDevice?.id == headset.id
    } else {
      selected
    }
    Log.i(
      TAG,
      "Kommunikationsgeräte-Anforderung: reason=$reason, selected=$selected, " +
        "appCommunicationDevice=$appCommunicationDevice, type=${headset.type}; " +
        "keine Bestätigung der Telecom-Anrufroute",
    )
    return appCommunicationDevice
  }

  fun clearCommunicationDeviceForHandset(context: Context) {
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (android.os.Build.VERSION.SDK_INT >= 31) {
      audio.clearCommunicationDevice()
    } else {
      @Suppress("DEPRECATION")
      audio.stopBluetoothSco()
    }
    @Suppress("DEPRECATION")
    run { audio.isSpeakerphoneOn = false }
  }

  internal fun isCommunicationHeadsetType(deviceType: Int): Boolean {
    return when (deviceType) {
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_USB_HEADSET -> true
      else -> android.os.Build.VERSION.SDK_INT >= 31 && deviceType == AudioDeviceInfo.TYPE_BLE_HEADSET
    }
  }

  private fun loadLocked(p: android.content.SharedPreferences): Request? {
    val id = p.getString(KEY_ID, "").orEmpty(); val phone = normalize(p.getString(KEY_PHONE, "").orEmpty())
    if (id.isEmpty() || phone.isEmpty()) return null
    val status = runCatching { Status.valueOf(p.getString(KEY_STATUS, Status.PENDING.name).orEmpty()) }.getOrDefault(Status.PENDING)
    return Request(id, phone, status)
  }
  fun normalize(value: String): String {
    val filtered = value.trim().replace(Regex("[^\\d+]"), "")
    if (filtered.isEmpty()) return ""
    return if (filtered.startsWith("+")) "+${filtered.drop(1).replace("+", "")}" else filtered.replace("+", "")
  }
}
