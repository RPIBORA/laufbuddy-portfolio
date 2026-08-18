package app.laufbuddy

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AudioFocusControlModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private val audioManager =
    reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private val focusChangeListener = AudioManager.OnAudioFocusChangeListener {
    // bewusst leer, wir wollen hier nur Focus anfordern bzw. freigeben
  }

  private var speechFocusRequest: AudioFocusRequest? = null
  private var duckFocusRequest: AudioFocusRequest? = null
  private val runCoachSpeaker =
    RunCoachSpeaker.getShared(reactApplicationContext)

  override fun getName(): String {
    return "AudioFocusControlModule"
  }

  @ReactMethod
  fun requestSpeechAudioFocus(promise: Promise) {
    try {
      abandonHeldAudioFocusInternal()

      val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(buildSpeechAudioAttributes())
          .setWillPauseWhenDucked(true)
          .setOnAudioFocusChangeListener(focusChangeListener)
          .build()

        speechFocusRequest = request
        audioManager.requestAudioFocus(request)
      } else {
        audioManager.requestAudioFocus(
          focusChangeListener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
        )
      }

      if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        promise.resolve(null)
        return
      }

      promise.reject(
        "AUDIO_FOCUS_NOT_GRANTED",
        "Audio-Focus für Sprachansage wurde nicht gewährt.",
      )
    } catch (error: Exception) {
      promise.reject(
        "AUDIO_FOCUS_REQUEST_FAILED",
        error.message ?: "Audio-Focus für Sprachansage konnte nicht angefordert werden.",
      )
    }
  }

  @ReactMethod
  fun requestDuckAudioFocus(promise: Promise) {
    try {
      abandonHeldAudioFocusInternal()

      val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val request =
          AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(buildSpeechAudioAttributes())
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener(focusChangeListener)
            .build()

        duckFocusRequest = request
        audioManager.requestAudioFocus(request)
      } else {
        audioManager.requestAudioFocus(
          focusChangeListener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK,
        )
      }

      if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        promise.resolve(null)
        return
      }

      promise.reject(
        "AUDIO_FOCUS_NOT_GRANTED",
        "Audio-Focus zum Ducken wurde nicht gewährt.",
      )
    } catch (error: Exception) {
      promise.reject(
        "AUDIO_FOCUS_REQUEST_FAILED",
        error.message ?: "Audio-Focus zum Ducken konnte nicht angefordert werden.",
      )
    }
  }

  @ReactMethod
  fun playEmergencyBeep(promise: Promise) {
    try {
      val toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 90)
      toneGenerator.startTone(ToneGenerator.TONE_PROP_BEEP, 180)

      Handler(Looper.getMainLooper()).postDelayed({
        toneGenerator.release()
      }, 250)

      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "EMERGENCY_BEEP_FAILED",
        error.message ?: "Notfall-Piepton konnte nicht abgespielt werden.",
      )
    }
  }

  @ReactMethod
  fun speakRunCoachText(
    message: String,
    promise: Promise,
  ) {
    try {
      runCoachSpeaker.speak(message)

      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "RUN_COACH_SPEECH_FAILED",
        error.message
          ?: "Kilometeransage konnte nicht gestartet werden.",
      )
    }
  }

  @ReactMethod
  fun abandonAudioFocus(promise: Promise) {
    try {
      abandonHeldAudioFocusInternal()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "AUDIO_FOCUS_RELEASE_FAILED",
        error.message ?: "Audio-Focus konnte nicht freigegeben werden.",
      )
    }
  }

  private fun abandonHeldAudioFocusInternal() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      speechFocusRequest?.let { request ->
        audioManager.abandonAudioFocusRequest(request)
      }

      duckFocusRequest?.let { request ->
        audioManager.abandonAudioFocusRequest(request)
      }

      speechFocusRequest = null
      duckFocusRequest = null
      return
    }

    audioManager.abandonAudioFocus(focusChangeListener)
  }

  private fun buildSpeechAudioAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
  }
}
