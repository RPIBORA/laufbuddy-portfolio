package app.laufbuddy

import android.app.*
import android.app.ForegroundServiceStartNotAllowedException
import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import java.io.File
import java.io.FileOutputStream

internal fun shouldRunHotword(
  headsetConnected: Boolean,
  pausedByWebRtc: Boolean,
  phoneCallActive: Boolean,
  disabledForCurrentRun: Boolean,
  missingPermission: Boolean,
): Boolean =
  headsetConnected &&
    !pausedByWebRtc &&
    !phoneCallActive &&
    !disabledForCurrentRun &&
    !missingPermission

internal fun hotwordStartBlockReason(
  hasRecordAudioPermission: Boolean,
  hasNotificationPermission: Boolean,
  appVisible: Boolean,
  headsetConnected: Boolean,
): String? = when {
  !hasRecordAudioPermission -> "Mikrofonberechtigung fehlt."
  !hasNotificationPermission -> "Benachrichtigungsberechtigung fehlt."
  !appVisible -> "Hotword-Start außerhalb einer sichtbaren App nicht erlaubt."
  !headsetConnected -> "Kein kompatibles Headset verbunden; Hotword-Dienst wird nicht benötigt."
  else -> null
}

internal enum class PhoneHotwordGate {
  ACTIVE_CALL,
  IDLE_AUDIO_RELEASING,
  READY,
}

internal fun phoneHotwordGate(callState: Int, audioMode: Int): PhoneHotwordGate {
  if (callState != TelephonyManager.CALL_STATE_IDLE) {
    return PhoneHotwordGate.ACTIVE_CALL
  }

  return when (audioMode) {
    AudioManager.MODE_IN_CALL,
    AudioManager.MODE_IN_COMMUNICATION,
    AudioManager.MODE_RINGTONE -> PhoneHotwordGate.IDLE_AUDIO_RELEASING
    else -> PhoneHotwordGate.READY
  }
}

internal enum class IdleAudioReleaseAction {
  RETRY,
  FALLBACK_RETRY,
  NONE,
}

internal fun nextIdleAudioReleaseAction(
  retryAttempts: Int,
  maxRetryAttempts: Int,
  fallbackScheduled: Boolean,
): IdleAudioReleaseAction = when {
  retryAttempts < maxRetryAttempts -> IdleAudioReleaseAction.RETRY
  !fallbackScheduled -> IdleAudioReleaseAction.FALLBACK_RETRY
  else -> IdleAudioReleaseAction.NONE
}

class LaufBuddyForegroundService : Service(), RecognitionListener {

  private var model: Model? = null
  private var recognizer: Recognizer? = null
  private var speechService: SpeechService? = null

  private val hotwordLock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())

  private var audioManager: AudioManager? = null
  private var telephonyManager: TelephonyManager? = null
  private var emergencyCallCoordinator: NativeEmergencyCallCoordinator? = null

  private val audioDeviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<AudioDeviceInfo>) {
      Log.d(TAG, "onAudioDevicesAdded: Audio-Gerät verbunden")
      syncHotwordRecognitionWithCurrentState("Audio-Gerät verbunden")
    }

    override fun onAudioDevicesRemoved(removedDevices: Array<AudioDeviceInfo>) {
      Log.d(TAG, "onAudioDevicesRemoved: Audio-Gerät getrennt")
      syncHotwordRecognitionWithCurrentState("Audio-Gerät getrennt")
    }
  }

  @Volatile
  private var isHotwordRecognitionRunning = false

  @Volatile
  private var isHotwordStartInProgress = false

  @Volatile
  private var isServiceClosing = false

  @Volatile
  private var hotwordPausedByWebRtc = false

  @Volatile
  private var hotwordDisabledForCurrentRun = false

  @Volatile
  private var idleAudioReleaseRetryScheduled = false

  @Volatile
  private var idleAudioReleaseRetryAttempts = 0

  @Volatile
  private var idleAudioReleaseFallbackScheduled = false

  @Volatile
  private var idleAudioReleaseGeneration = 0L

  @Volatile
  private var currentPhoneCallState = TelephonyManager.CALL_STATE_IDLE

  @Volatile
  private var emergencyCallLaunchPending = false

  @Volatile
  private var emergencyCallStateObserved = false

  private var phoneStateListenerRegistered = false

  @Suppress("DEPRECATION")
  private val legacyPhoneStateListener = object : PhoneStateListener() {
    override fun onCallStateChanged(state: Int, phoneNumber: String?) {
      handlePhoneCallStateChanged(state, "PhoneStateListener")
    }
  }

  private val phoneCallStateCallback: TelephonyCallback? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      object : TelephonyCallback(), TelephonyCallback.CallStateListener {
        override fun onCallStateChanged(state: Int) {
          handlePhoneCallStateChanged(state, "TelephonyCallback")
        }
      }
    } else {
      null
    }

  @Volatile
  private var lastDetectedHotword: String? = null

  @Volatile
  private var lastDetectedHotwordAtMs: Long = 0L

  override fun onCreate() {
    super.onCreate()

    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val startBlockReason = hotwordStartBlockReason(
      hasRecordAudioPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
      hasNotificationPermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED,
      appVisible = MainApplication.isAppVisible(),
      headsetConnected = isHeadsetConnected(),
    )
    if (startBlockReason != null) {
      updateLatestStatus(false, startBlockReason)
      Log.w(TAG, "onCreate: $startBlockReason")
      stopSelf()
      return
    }

    telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    promoteForegroundServiceForMicrophone("Hotword wird geprüft.")
    registerAudioDeviceCallback()
    registerPhoneStateListener()

    emergencyCallCoordinator = NativeEmergencyCallCoordinator(
      context = this,
      handler = mainHandler,
      onLaunchRequested = { _ ->
        // Kept only for the service's compatibility facade.  Durable dispatch
        // is performed by NativeEmergencyCallWorker, never by this microphone FGS.
      },
      onStatusChanged = { status ->
        handleNativeEmergencyStatus(status)
      },
    ).also { coordinator ->
      coordinator.start()
    }

    Log.d(TAG, "onCreate: sichtbarer Hotword-Start wird geprüft")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      null -> {
        syncHotwordRecognitionWithCurrentState("Android-Neustart")
      }

      ACTION_START_VISIBLE_APP,
      ACTION_REFRESH_HOTWORD_STATE -> {
        syncHotwordRecognitionWithCurrentState("Sichtbare App")
      }

      ACTION_SET_RUN_HOTWORD_ENABLED -> {
        val enabled = intent.getBooleanExtra(EXTRA_RUN_HOTWORD_ENABLED, true)
        hotwordDisabledForCurrentRun = !enabled
        syncHotwordRecognitionWithCurrentState(
          if (enabled) "Lauf-Hotword aktiviert" else "Lauf-Hotword deaktiviert",
        )
      }

      ACTION_PAUSE_HOTWORD_FOR_WEBRTC -> {
        Log.d(TAG, "onStartCommand: Hotword-Pause wegen WebRTC")
        hotwordPausedByWebRtc = true
        stopHotwordRecognition("WebRTC nutzt Mikrofon")
      }

      ACTION_RESUME_HOTWORD_AFTER_WEBRTC -> {
        Log.d(TAG, "onStartCommand: Hotword nach WebRTC wieder prüfen")
        hotwordPausedByWebRtc = false
        syncHotwordRecognitionWithCurrentState("WebRTC beendet")
      }

      ACTION_REFRESH_EMERGENCY_STATE -> {
        Log.d(TAG, "onStartCommand: Nativen Notrufstatus neu prüfen")
        emergencyCallCoordinator?.evaluate("Externer Status Refresh")
      }

      else -> {
        Log.w(TAG, "onStartCommand: unbekannte Aktion wird ignoriert: ${intent.action}")
      }
    }

    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    Log.i(TAG, "onTaskRemoved: Hotword-Auftrag bleibt für den laufenden Lauf aktiv")
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    Log.d(TAG, "onDestroy: Service wird beendet")
    isServiceClosing = true

    emergencyCallCoordinator?.stop()
    emergencyCallCoordinator = null

    unregisterAudioDeviceCallback()
    unregisterPhoneStateListener()
    stopHotwordRecognition("Service wird beendet", updateForeground = false)
    publishHotwordStatus("Dienst beendet.")
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? {
    return null
  }

  private fun registerAudioDeviceCallback() {
    try {
      audioManager?.registerAudioDeviceCallback(audioDeviceCallback, mainHandler)
      Log.d(TAG, "registerAudioDeviceCallback: aktiv")
    } catch (error: Exception) {
      Log.e(TAG, "registerAudioDeviceCallback: fehlgeschlagen", error)
    }
  }

  private fun unregisterAudioDeviceCallback() {
    try {
      audioManager?.unregisterAudioDeviceCallback(audioDeviceCallback)
      Log.d(TAG, "unregisterAudioDeviceCallback: beendet")
    } catch (error: Exception) {
      Log.e(TAG, "unregisterAudioDeviceCallback: fehlgeschlagen", error)
    }
  }

  private fun registerPhoneStateListener() {
    if (phoneStateListenerRegistered ||
      ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }

    try {
      val manager = telephonyManager ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        phoneCallStateCallback?.let { manager.registerTelephonyCallback(mainExecutor, it) }
      } else {
        @Suppress("DEPRECATION")
        manager.listen(legacyPhoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
      }
      phoneStateListenerRegistered = true
      handlePhoneCallStateChanged(manager.callState, "Initialer Telefonstatus")
    } catch (error: Exception) {
      Log.e(TAG, "registerPhoneStateListener: fehlgeschlagen", error)
    }
  }

  private fun unregisterPhoneStateListener() {
    if (!phoneStateListenerRegistered) return

    try {
      val manager = telephonyManager ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        phoneCallStateCallback?.let(manager::unregisterTelephonyCallback)
      } else {
        @Suppress("DEPRECATION")
        manager.listen(legacyPhoneStateListener, PhoneStateListener.LISTEN_NONE)
      }
    } catch (error: Exception) {
      Log.e(TAG, "unregisterPhoneStateListener: fehlgeschlagen", error)
    } finally {
      phoneStateListenerRegistered = false
    }
  }

  private fun handlePhoneCallStateChanged(state: Int, source: String) {
    currentPhoneCallState = state
    val stateName = when (state) {
      TelephonyManager.CALL_STATE_IDLE -> "IDLE"
      TelephonyManager.CALL_STATE_RINGING -> "RINGING"
      TelephonyManager.CALL_STATE_OFFHOOK -> "OFFHOOK"
      else -> "UNKNOWN($state)"
    }
    Log.i(TAG, "Telefonzustand: $stateName aus $source")
    mainHandler.post {
      if (state == TelephonyManager.CALL_STATE_IDLE) {
        if (emergencyCallStateObserved) {
          emergencyCallLaunchPending = false
        }
        resetIdleAudioReleaseRecovery()
      } else {
        emergencyCallStateObserved = true
        emergencyCallLaunchPending = false
        cancelIdleAudioReleaseRecovery()
      }
      syncHotwordRecognitionWithCurrentState("Telefonzustand $stateName")
    }
  }

  private fun syncHotwordRecognitionWithCurrentState(reason: String) {
    val headsetConnected = isHeadsetConnected()
    val phoneGate = currentPhoneHotwordGate()
    val missingPermissionReason = missingStartPermissionReason()
    val shouldRun = shouldRunHotword(
      headsetConnected = headsetConnected,
      pausedByWebRtc = hotwordPausedByWebRtc,
      phoneCallActive = phoneGate == PhoneHotwordGate.ACTIVE_CALL,
      disabledForCurrentRun = hotwordDisabledForCurrentRun,
      missingPermission = missingPermissionReason != null,
    )

    Log.d(
      TAG,
      "syncHotwordRecognitionWithCurrentState: reason=$reason, headsetConnected=$headsetConnected, hotwordPausedByWebRtc=$hotwordPausedByWebRtc, phoneGate=$phoneGate, hotwordDisabledForCurrentRun=$hotwordDisabledForCurrentRun, missingPermissionReason=$missingPermissionReason, shouldRun=$shouldRun"
    )

    if (phoneGate == PhoneHotwordGate.ACTIVE_CALL) {
      stopHotwordRecognition("Telefonanruf läuft: $reason")
      return
    }

    if (emergencyCallLaunchPending) {
      stopHotwordRecognition("Notruf wird aufgebaut: $reason")
      return
    }

    if (phoneGate == PhoneHotwordGate.IDLE_AUDIO_RELEASING) {
      stopHotwordRecognition("Telefon-Audio wird nach IDLE freigegeben: $reason")
      scheduleIdleAudioReleaseRecovery()
      return
    }

    if (missingPermissionReason != null) {
      stopHotwordRecognition(missingPermissionReason)
      return
    }

    if (hotwordDisabledForCurrentRun) {
      stopHotwordRecognition("Für diesen Lauf ausgeschaltet.")
      return
    }

    if (shouldRun) {
      cancelIdleAudioReleaseRecovery()
      startHotwordRecognition(reason)
      return
    }

    stopHotwordRecognition(
      if (!headsetConnected) "Headset nicht verbunden." else "Hotword pausiert: $reason",
    )
  }

  private fun resetIdleAudioReleaseRecovery() {
    idleAudioReleaseGeneration += 1
    idleAudioReleaseRetryScheduled = false
    idleAudioReleaseRetryAttempts = 0
    idleAudioReleaseFallbackScheduled = false
  }

  private fun currentPhoneHotwordGate(): PhoneHotwordGate = phoneHotwordGate(
    currentPhoneCallState,
    (audioManager ?: getSystemService(Context.AUDIO_SERVICE) as AudioManager).mode,
  )

  private fun cancelIdleAudioReleaseRecovery() {
    idleAudioReleaseGeneration += 1
    idleAudioReleaseRetryScheduled = false
    idleAudioReleaseFallbackScheduled = false
  }

  private fun scheduleIdleAudioReleaseRecovery() {
    if (currentPhoneCallState != TelephonyManager.CALL_STATE_IDLE || idleAudioReleaseRetryScheduled) {
      return
    }

    when (
      nextIdleAudioReleaseAction(
        idleAudioReleaseRetryAttempts,
        MAX_IDLE_AUDIO_RELEASE_RETRY_ATTEMPTS,
        idleAudioReleaseFallbackScheduled,
      )
    ) {
      IdleAudioReleaseAction.RETRY -> {
        idleAudioReleaseRetryScheduled = true
        idleAudioReleaseRetryAttempts += 1
        val generation = idleAudioReleaseGeneration
        mainHandler.postDelayed({
          if (generation != idleAudioReleaseGeneration) return@postDelayed
          idleAudioReleaseRetryScheduled = false
          syncHotwordRecognitionWithCurrentState("IDLE-Audiofreigabe erneut prüfen")
        }, IDLE_AUDIO_RELEASE_RETRY_DELAY_MS)
      }

      IdleAudioReleaseAction.FALLBACK_RETRY -> {
        idleAudioReleaseRetryScheduled = true
        idleAudioReleaseFallbackScheduled = true
        val generation = idleAudioReleaseGeneration
        mainHandler.postDelayed({
          if (generation != idleAudioReleaseGeneration) return@postDelayed
          idleAudioReleaseRetryScheduled = false
          syncHotwordRecognitionWithCurrentState("IDLE-Audiofreigabe später erneut prüfen")
        }, IDLE_AUDIO_RELEASE_FALLBACK_DELAY_MS)
      }

      IdleAudioReleaseAction.NONE -> Unit
    }
  }

  private fun scheduleEmergencyCallLaunchGuard() {
    emergencyCallLaunchPending = true
    emergencyCallStateObserved = false
    mainHandler.postDelayed({
      if (
        emergencyCallLaunchPending &&
          currentPhoneCallState == TelephonyManager.CALL_STATE_IDLE
      ) {
        emergencyCallLaunchPending = false
        syncHotwordRecognitionWithCurrentState("Notrufaufbau ohne Telefonstatus beendet")
      }
    }, EMERGENCY_CALL_LAUNCH_GUARD_DELAY_MS)
  }

  private fun scheduleHotwordRestartAfterDetection(detectedHotword: String) {
    mainHandler.postDelayed({
      Log.d(TAG, "scheduleHotwordRestartAfterDetection: Hotword neu prüfen nach $detectedHotword")
      syncHotwordRecognitionWithCurrentState("Hotword verarbeitet: $detectedHotword")
    }, HOTWORD_RESTART_AFTER_DETECTION_DELAY_MS)
  }

  private fun startHotwordRecognition(reason: String) {
    synchronized(hotwordLock) {
      if (isHotwordRecognitionRunning || isHotwordStartInProgress) {
        Log.d(
          TAG,
          "startHotwordRecognition: übersprungen, läuft bereits oder startet gerade"
        )
        return
      }

      if (isServiceClosing) {
        Log.d(TAG, "startHotwordRecognition: Dienst wird bereits beendet")
        return
      }

      isHotwordStartInProgress = true
    }

    Thread {
      var createdModel: Model? = null
      var createdRecognizer: Recognizer? = null
      var createdSpeechService: SpeechService? = null

      try {
        Log.d(TAG, "startHotwordRecognition: Start angefordert, reason=$reason")

        if (!isHeadsetConnected()) {
          Log.d(TAG, "startHotwordRecognition: abgebrochen, kein Headset verbunden")
          return@Thread
        }

        if (hotwordPausedByWebRtc) {
          Log.d(TAG, "startHotwordRecognition: abgebrochen, WebRTC nutzt Mikrofon")
          return@Thread
        }

        if (isServiceClosing) {
          return@Thread
        }

        if (currentPhoneHotwordGate() != PhoneHotwordGate.READY || emergencyCallLaunchPending) {
          Log.d(TAG, "startHotwordRecognition: abgebrochen, Telefon-Audio noch nicht freigegeben")
          scheduleIdleAudioReleaseRecovery()
          return@Thread
        }

        val missingPermissionReason = missingStartPermissionReason()
        if (missingPermissionReason != null) {
          Log.d(TAG, "startHotwordRecognition: $missingPermissionReason")
          return@Thread
        }

        promoteForegroundServiceForMicrophone("Hotword wird gestartet.")

        val modelPath = ensureModelUnpacked()

        Log.d(TAG, "startHotwordRecognition: Nutze Modellpfad: $modelPath")

        createdModel = Model(modelPath)
        createdRecognizer = Recognizer(createdModel, 16000.0f)
        createdSpeechService = SpeechService(createdRecognizer, 16000.0f)

        synchronized(hotwordLock) {
          if (
            !isHeadsetConnected() ||
            hotwordPausedByWebRtc ||
            currentPhoneHotwordGate() != PhoneHotwordGate.READY ||
            emergencyCallLaunchPending ||
            missingStartPermissionReason() != null ||
            isServiceClosing
          ) {
            Log.d(
              TAG,
              "startHotwordRecognition: nach Modell-Laden abgebrochen, Zustand nicht mehr erlaubt"
            )
            return@synchronized
          }

          model = createdModel
          recognizer = createdRecognizer
          speechService = createdSpeechService

          createdModel = null
          createdRecognizer = null
          createdSpeechService = null
        }

        if (speechService == null) {
          Log.d(TAG, "startHotwordRecognition: SpeechService nicht übernommen")
          updateForegroundState("Dienst konnte nicht gestartet werden.")
          return@Thread
        }

        val started = speechService?.startListening(this) ?: false

        synchronized(hotwordLock) {
          isHotwordRecognitionRunning = started
        }

        updateForegroundState(
          if (started) "LaufBuddy aktiv." else "Dienst konnte nicht gestartet werden.",
        )

        Log.d(TAG, "SpeechService startListening Ergebnis: $started")
      } catch (e: Exception) {
        Log.e(TAG, "Fehler beim Hotword-Start", e)

        synchronized(hotwordLock) {
          isHotwordRecognitionRunning = false
          speechService = null
          recognizer = null
          model = null
        }

        updateForegroundState("Dienst konnte nicht gestartet werden.")
      } finally {
        try {
          createdSpeechService?.stop()
          createdSpeechService?.shutdown()
        } catch (error: Exception) {
          Log.e(TAG, "Fehler beim Freigeben von nicht genutztem SpeechService", error)
        }

        try {
          createdRecognizer?.close()
        } catch (error: Exception) {
          Log.e(TAG, "Fehler beim Freigeben von nicht genutztem Recognizer", error)
        }

        try {
          createdModel?.close()
        } catch (error: Exception) {
          Log.e(TAG, "Fehler beim Freigeben von nicht genutztem Model", error)
        }

        synchronized(hotwordLock) {
          isHotwordStartInProgress = false
        }
        updateForegroundState(
          if (isHotwordRecognitionRunning) "LaufBuddy aktiv." else "Dienst konnte nicht gestartet werden.",
        )
      }
    }.start()
  }

  private fun stopHotwordRecognition(
    reason: String,
    updateForeground: Boolean = true,
  ) {
    synchronized(hotwordLock) {
      Log.d(TAG, "stopHotwordRecognition: reason=$reason")

      try {
        speechService?.stop()
        speechService?.shutdown()
      } catch (e: Exception) {
        Log.e(TAG, "Fehler beim Stoppen von SpeechService", e)
      }

      try {
        recognizer?.close()
      } catch (e: Exception) {
        Log.e(TAG, "Fehler beim Schließen von Recognizer", e)
      }

      try {
        model?.close()
      } catch (e: Exception) {
        Log.e(TAG, "Fehler beim Schließen von Model", e)
      }

      speechService = null
      recognizer = null
      model = null
      isHotwordRecognitionRunning = false
    }

    if (updateForeground) {
      updateForegroundState(reason)
    }
  }

  private fun completeHotwordCleanup(reason: String) {
    mainHandler.removeCallbacksAndMessages(null)
    hotwordPausedByWebRtc = false
    cancelIdleAudioReleaseRecovery()
    stopHotwordRecognition(reason, updateForeground = false)
  }

  private fun missingStartPermissionReason(): String? {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      return "Mikrofonberechtigung fehlt."
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return "Benachrichtigungsberechtigung fehlt."
    }

    return null
  }

  private fun isHeadsetConnected(): Boolean {
    val manager = audioManager ?: getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val devices = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)

    return devices.any { device ->
      isSupportedHeadsetDevice(device)
    }
  }

  private fun isSupportedHeadsetDevice(device: AudioDeviceInfo): Boolean {
    return when (device.type) {
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_USB_HEADSET -> true

      else -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
          device.type == AudioDeviceInfo.TYPE_HEARING_AID
        ) {
          return true
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
          device.type == AudioDeviceInfo.TYPE_BLE_HEADSET
        ) {
          return true
        }

        false
      }
    }
  }

  private fun ensureModelUnpacked(): String {
    val modelsDir = File(applicationContext.getExternalFilesDir(null), "models")
    val targetDir = File(modelsDir, "model-de-de")
    val markerFile = File(targetDir, ".laufbuddy_model_ready")

    if (markerFile.exists()) {
      return targetDir.absolutePath
    }

    if (!targetDir.exists()) {
      targetDir.mkdirs()
    }

    copyAssetFolder("model-de-de", targetDir)

    markerFile.writeText("ready")

    return targetDir.absolutePath
  }

  private fun copyAssetFolder(assetPath: String, targetDir: File) {
    val assetItems = assets.list(assetPath)

    if (assetItems == null || assetItems.isEmpty()) {
      copyAssetFile(assetPath, targetDir)
      return
    }

    if (!targetDir.exists()) {
      targetDir.mkdirs()
    }

    for (item in assetItems) {
      val childAssetPath = "$assetPath/$item"
      val childTarget = File(targetDir, item)
      copyAssetFolder(childAssetPath, childTarget)
    }
  }

  private fun copyAssetFile(assetPath: String, targetFile: File) {
    val parentDir = targetFile.parentFile

    if (parentDir != null && !parentDir.exists()) {
      parentDir.mkdirs()
    }

    assets.open(assetPath).use { input ->
      FileOutputStream(targetFile).use { output ->
        input.copyTo(output)
      }
    }
  }

  override fun onResult(hypothesis: String) {
    handleResult(hypothesis)
  }

  override fun onFinalResult(hypothesis: String) {
    handleResult(hypothesis)
  }

  override fun onPartialResult(hypothesis: String) {
    Log.d(TAG, "Partial: $hypothesis")
  }

  override fun onError(e: Exception) {
    Log.e(TAG, "onError: SpeechService Fehler", e)
    isHotwordRecognitionRunning = false
    syncHotwordRecognitionWithCurrentState("SpeechService Fehler")
  }

  override fun onTimeout() {
    Log.d(TAG, "onTimeout: SpeechService hat Timeout gemeldet")
    isHotwordRecognitionRunning = false
    syncHotwordRecognitionWithCurrentState("SpeechService Timeout")
  }

  private fun handleResult(hypothesis: String) {
    try {
      val json = JSONObject(hypothesis)
      val text = json.optString("text").trim().lowercase()

      Log.d(TAG, "Erkannt: $text")

      val detectedHotword = detectSupportedHotword(text)

      if (detectedHotword == null) {
        return
      }

      if (isDuplicateHotwordInCooldown(detectedHotword)) {
        Log.d(TAG, "HOTWORD ignoriert wegen Cooldown: $detectedHotword")
        return
      }

      rememberDetectedHotword(detectedHotword)

      Log.d(TAG, "HOTWORD ERKANNT: $detectedHotword")

      if (detectedHotword == "hilfe") {
        // The durable record is committed before releasing the microphone or
        // doing any asynchronous UI/JS work.
        val coordinator = emergencyCallCoordinator
        val queued = coordinator?.queueHelpEmergency() == true
        if (!queued) {
          Log.e(TAG, "Notruf konnte nicht dauerhaft eingereiht werden")
          return
        }

        stopHotwordRecognition("Notrufauftrag dauerhaft gespeichert")
        scheduleEmergencyCallLaunchGuard()
        playNativeEmergencyBeep()

        LaufBuddyHotwordControlModule.emitNativeHotwordDetected(detectedHotword)

        Log.d(
          TAG,
          "Hotword-Neustart nach Notruf-Hotword blockiert: $detectedHotword"
        )

        return
      }

      stopHotwordRecognition("Hotword erkannt: $detectedHotword")

      LaufBuddyHotwordControlModule.emitNativeHotwordDetected(detectedHotword)

      scheduleHotwordRestartAfterDetection(detectedHotword)
    } catch (e: Exception) {
      Log.e(TAG, "Parse Fehler", e)
    }
  }

  private fun isDuplicateHotwordInCooldown(detectedHotword: String): Boolean {
    val nowMs = SystemClock.elapsedRealtime()
    val previousHotword = lastDetectedHotword
    val previousAtMs = lastDetectedHotwordAtMs

    return previousHotword == detectedHotword &&
      nowMs - previousAtMs < SAME_HOTWORD_COOLDOWN_MS
  }

  private fun rememberDetectedHotword(detectedHotword: String) {
    lastDetectedHotword = detectedHotword
    lastDetectedHotwordAtMs = SystemClock.elapsedRealtime()
  }

  private fun detectSupportedHotword(text: String): String? {
    if (text.contains("hilfe")) {
      return "hilfe"
    }

    if (text.contains("polizei")) {
      return "polizei"
    }

    if (text.contains("ja")) {
      return "ja"
    }

    return null
  }

  private fun playNativeEmergencyBeep() {
    try {
      val toneGenerator = ToneGenerator(
        AudioManager.STREAM_MUSIC,
        90,
      )

      toneGenerator.startTone(
        ToneGenerator.TONE_PROP_BEEP,
        180,
      )

      mainHandler.postDelayed({
        toneGenerator.release()
      }, 250L)
    } catch (error: Exception) {
      Log.e(TAG, "Nativer Notfall-Piepton fehlgeschlagen", error)
    }
  }

  private fun handleNativeEmergencyStatus(
    status: NativeEmergencyCallCoordinator.Status,
  ) {
    // The pending emergency state remains persisted by the coordinator, but it
    // must not keep the microphone FGS alive after recognition has stopped.
    publishHotwordStatus("Notrufstatus: $status")
  }

  private fun updateForegroundState(reason: String) {
    publishHotwordStatus(reason)
    promoteForegroundServiceForMicrophone(
      if (isHotwordRecognitionRunning) "LaufBuddy aktiv." else reason,
    )
  }

  private fun promoteForegroundServiceForMicrophone(contentText: String) {
    if (missingStartPermissionReason() != null) {
      updateLatestStatus(false, missingStartPermissionReason() ?: "Mikrofonberechtigung fehlt.")
      stopSelf()
      return
    }

    val notification = buildServiceNotification(
      contentText = contentText,
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        SERVICE_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      )
      return
    }

    startForeground(SERVICE_NOTIFICATION_ID, notification)
  }

  private fun buildServiceNotification(
    contentText: String,
  ): Notification {
    /*
     * Neuer Kanalname ist erforderlich, weil Android die Wichtigkeit
     * eines bereits angelegten NotificationChannels nicht nachträglich
     * von HIGH auf LOW reduziert.
     */
    val channelId = "laufbuddy_service_v2"

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        channelId,
        "LaufBuddy Hintergrunddienst",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "LaufBuddy läuft im Hintergrund"
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
      }

      val manager =
        getSystemService(
          Context.NOTIFICATION_SERVICE,
        ) as NotificationManager

      manager.createNotificationChannel(channel)
    }

    return NotificationCompat.Builder(this, channelId)
      .setContentTitle("LaufBuddy")
      .setContentText(contentText)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setOnlyAlertOnce(true)
      .setOngoing(true)
      .setSilent(true)
      .build()
  }

  private fun publishHotwordStatus(reason: String) {
    val active = isHotwordRecognitionRunning &&
      isHeadsetConnected() &&
      !hotwordDisabledForCurrentRun &&
      missingStartPermissionReason() == null
    updateLatestStatus(active, reason)
  }

  companion object {
    private const val TAG = "LaufBuddyService"
    private const val SERVICE_NOTIFICATION_ID = 1
    private const val EMERGENCY_NOTIFICATION_ID = 2
    private const val SAME_HOTWORD_COOLDOWN_MS = 1500L
    private const val HOTWORD_RESTART_AFTER_DETECTION_DELAY_MS = 1200L
    private const val MAX_IDLE_AUDIO_RELEASE_RETRY_ATTEMPTS = 6
    private const val IDLE_AUDIO_RELEASE_RETRY_DELAY_MS = 750L
    private const val IDLE_AUDIO_RELEASE_FALLBACK_DELAY_MS = 10000L
    private const val EMERGENCY_CALL_LAUNCH_GUARD_DELAY_MS = 5000L

    private const val ACTION_START_VISIBLE_APP =
      "app.laufbuddy.START_HOTWORD_FROM_VISIBLE_APP"

    private const val ACTION_SET_RUN_HOTWORD_ENABLED =
      "app.laufbuddy.SET_RUN_HOTWORD_ENABLED"

    private const val EXTRA_RUN_HOTWORD_ENABLED = "run_hotword_enabled"

    private const val ACTION_REFRESH_HOTWORD_STATE =
      "app.laufbuddy.REFRESH_HOTWORD_STATE"

    private const val ACTION_REFRESH_EMERGENCY_STATE =
      "app.laufbuddy.REFRESH_EMERGENCY_STATE"

    private const val ACTION_PAUSE_HOTWORD_FOR_WEBRTC =
      "app.laufbuddy.PAUSE_HOTWORD_FOR_WEBRTC"

    private const val ACTION_RESUME_HOTWORD_AFTER_WEBRTC =
      "app.laufbuddy.RESUME_HOTWORD_AFTER_WEBRTC"

    data class HotwordStatusSnapshot(
      val active: Boolean,
      val reason: String,
    )

    @Volatile
    private var latestHotwordStatus = HotwordStatusSnapshot(
      active = false,
      reason = "Dienst noch nicht gestartet.",
    )

    fun currentHotwordStatus(): HotwordStatusSnapshot = latestHotwordStatus

    private fun missingPublicStartReason(context: Context): String? {
      val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val headsetConnected = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { device ->
        when (device.type) {
          AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
          AudioDeviceInfo.TYPE_WIRED_HEADSET,
          AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
          AudioDeviceInfo.TYPE_USB_HEADSET -> true
          AudioDeviceInfo.TYPE_HEARING_AID -> Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
          AudioDeviceInfo.TYPE_BLE_HEADSET -> Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
          else -> false
        }
      }
      return hotwordStartBlockReason(
        hasRecordAudioPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
        hasNotificationPermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED,
        appVisible = MainApplication.isAppVisible(),
        headsetConnected = headsetConnected,
      )
    }

    private fun startChecked(context: Context, action: String, enabled: Boolean? = null): HotwordStatusSnapshot {
      val blockedReason = missingPublicStartReason(context)
      if (blockedReason != null) {
        updateLatestStatus(false, blockedReason)
        return latestHotwordStatus
      }

      val intent = Intent(context, LaufBuddyForegroundService::class.java).apply {
        this.action = action
        enabled?.let { putExtra(EXTRA_RUN_HOTWORD_ENABLED, it) }
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
      } catch (error: ForegroundServiceStartNotAllowedException) {
        updateLatestStatus(false, "Hotword-Dienst darf im aktuellen Android-Zustand nicht gestartet werden.")
        Log.w(TAG, "startChecked: Android hat den Foreground-Service-Start abgelehnt", error)
      } catch (error: SecurityException) {
        updateLatestStatus(false, "Hotword-Dienst wurde von Android wegen fehlender Berechtigung nicht gestartet.")
        Log.w(TAG, "startChecked: Sicherheitsprüfung fehlgeschlagen", error)
      }
      return latestHotwordStatus
    }

    fun setHotwordEnabledForCurrentRun(context: Context, enabled: Boolean): HotwordStatusSnapshot {
      if (!enabled && !MainApplication.isAppVisible()) {
        updateLatestStatus(false, "Hotword ist für diesen Lauf ausgeschaltet.")
        return latestHotwordStatus
      }
      return startChecked(context, ACTION_SET_RUN_HOTWORD_ENABLED, enabled)
    }

    private fun updateLatestStatus(active: Boolean, reason: String) {
      latestHotwordStatus = HotwordStatusSnapshot(active, reason)
      LaufBuddyHotwordControlModule.emitNativeHotwordStatus(active, reason)
    }

    fun startFromVisibleApp(context: Context): HotwordStatusSnapshot {
      return startChecked(context, ACTION_START_VISIBLE_APP)
    }

    fun refreshHotwordState(context: Context): HotwordStatusSnapshot {
      return startFromVisibleApp(context)
    }

    fun refreshEmergencyState(context: Context) {
      // Emergency state is durable in NativeEmergencyCallStore. It must never
      // create a microphone FGS merely to refresh that state.
      if (MainApplication.isAppVisible()) startChecked(context, ACTION_REFRESH_EMERGENCY_STATE)
    }

    fun pauseHotwordForWebRtc(context: Context): HotwordStatusSnapshot {
      return startChecked(context, ACTION_PAUSE_HOTWORD_FOR_WEBRTC)
    }

    fun resumeHotwordAfterWebRtc(context: Context): HotwordStatusSnapshot {
      return startChecked(context, ACTION_RESUME_HOTWORD_AFTER_WEBRTC)
    }

    fun triggerEmergency(context: Context, phoneNumber: String) {
      val channelId = "laufbuddy_emergency"

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(
          channelId,
          "LaufBuddy Notfall",
          NotificationManager.IMPORTANCE_HIGH
        ).apply {
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          description = "LaufBuddy Notfallanzeige"
        }

        val manager =
          context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
      }

      val intent = Intent(context, EmergencyCallActivity::class.java).apply {
        putExtra(EmergencyCallActivity.EXTRA_PHONE_NUMBER, phoneNumber)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY)
      }

      val activityOptionsBundle =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          ActivityOptions.makeBasic().apply {
            setPendingIntentCreatorBackgroundActivityStartMode(
              getEmergencyBackgroundActivityStartMode()
            )
          }.toBundle()
        } else {
          null
        }

      val emergencyNotificationId = EMERGENCY_NOTIFICATION_ID

      val pendingIntent = PendingIntent.getActivity(
        context,
        emergencyNotificationId,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        activityOptionsBundle
      )

      val notificationBuilder = NotificationCompat.Builder(context, channelId)
        .setContentTitle("NOTFALL")
        .setContentText("Hilfe wird gerufen")
        .setSmallIcon(android.R.drawable.ic_dialog_alert)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setContentIntent(pendingIntent)

      val manager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

      val fullScreenAllowed =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
          manager.canUseFullScreenIntent()
      if (fullScreenAllowed) {
        notificationBuilder.setFullScreenIntent(pendingIntent, true)
      } else {
        Log.w(TAG, "triggerEmergency: Full-Screen-Sonderzugriff fehlt; normale Notfallbenachrichtigung wird verwendet")
      }
      val notification = notificationBuilder.build()

      Log.i(TAG, "triggerEmergency: FullScreenIntent Notification wird gesendet: $emergencyNotificationId")
      manager.notify(emergencyNotificationId, notification)
    }

    fun clearEmergencyNotification(context: Context) {
      val manager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

      manager.cancel(EMERGENCY_NOTIFICATION_ID)
    }

    @Suppress("DEPRECATION")
    private fun getEmergencyBackgroundActivityStartMode(): Int {
      return if (Build.VERSION.SDK_INT >= 36) {
        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOW_ALWAYS
      } else {
        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
      }
    }
  }
}
