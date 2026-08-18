package app.laufbuddy

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.ArrayDeque
import java.util.Locale

class RunCoachSpeaker(
  context: Context,
  private val audioManager: AudioManager,
) : TextToSpeech.OnInitListener {

  private val applicationContext = context.applicationContext
  private val mainHandler = Handler(Looper.getMainLooper())
  private val pendingMessages = ArrayDeque<String>()
  private val activeUtteranceIds = mutableSetOf<String>()

  private val focusChangeListener =
    AudioManager.OnAudioFocusChangeListener { focusChange ->
      when (focusChange) {
        AudioManager.AUDIOFOCUS_LOSS,
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
          mainHandler.post {
            Log.w(TAG, "Audiofocus verloren: Sprachausgabe wird beendet")
            stopCurrentSpeech()
          }
        }
      }
    }

  private var textToSpeech: TextToSpeech? = null
  private var speechFocusRequest: AudioFocusRequest? = null
  private var initialized = false
  private var shutdownRequested = false

  init {
    mainHandler.post {
      if (!shutdownRequested) {
        textToSpeech = TextToSpeech(applicationContext, this)
      }
    }
  }

  override fun onInit(status: Int) {
    mainHandler.post {
      if (shutdownRequested) {
        textToSpeech?.shutdown()
        textToSpeech = null
        return@post
      }

      val engine = textToSpeech

      if (status != TextToSpeech.SUCCESS || engine == null) {
        Log.e(TAG, "TextToSpeech konnte nicht initialisiert werden")
        pendingMessages.clear()
        return@post
      }

      val languageResult = engine.setLanguage(Locale.GERMANY)

      if (
        languageResult == TextToSpeech.LANG_MISSING_DATA ||
        languageResult == TextToSpeech.LANG_NOT_SUPPORTED
      ) {
        Log.e(TAG, "Deutsche TextToSpeech-Sprache ist nicht verfügbar")
        pendingMessages.clear()
        return@post
      }

      engine.setSpeechRate(1.08f)
      engine.setPitch(0.82f)
      engine.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )

      engine.setOnUtteranceProgressListener(
        object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) {
            Log.i(TAG, "Kilometeransage gestartet: $utteranceId")
          }

          override fun onDone(utteranceId: String?) {
            finishUtterance(utteranceId, "beendet")
          }

          @Deprecated("Deprecated in Android")
          override fun onError(utteranceId: String?) {
            finishUtterance(utteranceId, "fehlgeschlagen")
          }

          override fun onError(utteranceId: String?, errorCode: Int) {
            finishUtterance(
              utteranceId,
              "fehlgeschlagen, Fehlercode=$errorCode",
            )
          }
        }
      )

      initialized = true
      Log.i(TAG, "Native Kilometer-Sprachausgabe ist bereit")
      drainPendingMessages()
    }
  }

  fun speak(message: String) {
    val trimmedMessage = message.trim()

    if (trimmedMessage.isEmpty()) {
      return
    }

    mainHandler.post {
      if (shutdownRequested) {
        Log.w(TAG, "Kilometeransage verworfen: Sprecher beendet")
        return@post
      }

      if (isCommunicationAudioActive()) {
        Log.w(
          TAG,
          "Kilometeransage ausgelassen: Telefonat oder Kommunikation aktiv",
        )
        return@post
      }

      pendingMessages.addLast(trimmedMessage)
      drainPendingMessages()
    }
  }

  fun shutdown() {
    mainHandler.post {
      shutdownRequested = true
      pendingMessages.clear()
      stopCurrentSpeech()

      textToSpeech?.shutdown()
      textToSpeech = null
      initialized = false

      Log.i(TAG, "Native Kilometer-Sprachausgabe beendet")
    }
  }

  private fun drainPendingMessages() {
    val engine = textToSpeech

    if (
      !initialized ||
      engine == null ||
      pendingMessages.isEmpty() ||
      shutdownRequested
    ) {
      return
    }

    if (
      activeUtteranceIds.isEmpty() &&
      !requestSpeechAudioFocus()
    ) {
      Log.w(TAG, "Kilometeransage verworfen: Audiofocus nicht erhalten")
      pendingMessages.clear()
      return
    }

    while (pendingMessages.isNotEmpty()) {
      val message = pendingMessages.removeFirst()
      val utteranceId =
        "run_coach_${SystemClock.elapsedRealtimeNanos()}"

      activeUtteranceIds.add(utteranceId)

      val result = engine.speak(
        message,
        TextToSpeech.QUEUE_ADD,
        null,
        utteranceId,
      )

      if (result == TextToSpeech.ERROR) {
        Log.e(TAG, "Kilometeransage konnte nicht eingereiht werden")
        activeUtteranceIds.remove(utteranceId)
      } else {
        Log.i(TAG, "Kilometeransage eingereiht: $message")
      }
    }

    releaseAudioFocusWhenIdle()
  }

  private fun finishUtterance(
    utteranceId: String?,
    outcome: String,
  ) {
    mainHandler.post {
      if (utteranceId != null) {
        activeUtteranceIds.remove(utteranceId)
      }

      Log.i(TAG, "Kilometeransage $outcome: $utteranceId")
      releaseAudioFocusWhenIdle()
    }
  }

  private fun stopCurrentSpeech() {
    textToSpeech?.stop()
    activeUtteranceIds.clear()
    abandonSpeechAudioFocus()
  }

  private fun releaseAudioFocusWhenIdle() {
    if (activeUtteranceIds.isEmpty()) {
      abandonSpeechAudioFocus()
    }
  }

  private fun requestSpeechAudioFocus(): Boolean {
    abandonSpeechAudioFocus()

    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request =
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          .setWillPauseWhenDucked(true)
          .setOnAudioFocusChangeListener(focusChangeListener)
          .build()

      speechFocusRequest = request
      audioManager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(
        focusChangeListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
      )
    }

    return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun abandonSpeechAudioFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      speechFocusRequest?.let { request ->
        audioManager.abandonAudioFocusRequest(request)
      }

      speechFocusRequest = null
      return
    }

    @Suppress("DEPRECATION")
    audioManager.abandonAudioFocus(focusChangeListener)
  }

  private fun isCommunicationAudioActive(): Boolean {
    return when (audioManager.mode) {
      AudioManager.MODE_IN_CALL,
      AudioManager.MODE_IN_COMMUNICATION,
      AudioManager.MODE_RINGTONE -> true

      else -> false
    }
  }

  companion object {
    private const val TAG = "RunCoachSpeaker"

    @Volatile
    private var sharedInstance: RunCoachSpeaker? = null

    fun getShared(context: Context): RunCoachSpeaker {
      val applicationContext = context.applicationContext

      return sharedInstance ?: synchronized(this) {
        sharedInstance ?: RunCoachSpeaker(
          context = applicationContext,
          audioManager =
            applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager,
        ).also { speaker ->
          sharedInstance = speaker
        }
      }
    }
  }
}
