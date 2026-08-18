package app.laufbuddy.motion

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity
import com.google.android.gms.tasks.Tasks
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

class LaufBuddyMotionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LaufBuddyMotion")

    Events("onMotionActivityChanged")

    OnCreate {
      LaufBuddyMotionEvents.attach(this@LaufBuddyMotionModule)
    }

    OnDestroy {
      LaufBuddyMotionEvents.detach(this@LaufBuddyMotionModule)
    }

    AsyncFunction("getStatusAsync") {
      getStatusPayload()
    }

    AsyncFunction("getLastActivityAsync") {
      LaufBuddyMotionEvents.getLastPayload()
    }

    AsyncFunction("startActivityRecognitionAsync") {
      startActivityRecognition()
    }

    AsyncFunction("stopActivityRecognitionAsync") {
      stopActivityRecognition()
    }
  }

  fun emitMotionChanged(payload: Map<String, Any?>) {
    sendEvent("onMotionActivityChanged", payload)
  }

  private fun startActivityRecognition(): Map<String, Any?> {
    val context = getApplicationContext()

    if (!hasGooglePlayServices(context)) {
      return getStatusPayload(
        started = false,
        message = "Google Play Services nicht verfügbar."
      )
    }

    if (!hasActivityRecognitionPermission(context)) {
      return getStatusPayload(
        started = false,
        message = "ACTIVITY_RECOGNITION Berechtigung fehlt."
      )
    }

    val client = ActivityRecognition.getClient(context)
    val request = ActivityTransitionRequest(createTransitions())

    Tasks.await(
      client.requestActivityTransitionUpdates(request, createPendingIntent(context)),
      10,
      TimeUnit.SECONDS
    )

    return getStatusPayload(
      started = true,
      message = "Activity Recognition gestartet."
    )
  }

  private fun stopActivityRecognition(): Map<String, Any?> {
    val context = getApplicationContext()
    val client = ActivityRecognition.getClient(context)

    Tasks.await(
      client.removeActivityTransitionUpdates(createPendingIntent(context)),
      10,
      TimeUnit.SECONDS
    )

    return getStatusPayload(
      started = false,
      message = "Activity Recognition gestoppt."
    )
  }

  private fun getStatusPayload(
    started: Boolean? = null,
    message: String? = null
  ): Map<String, Any?> {
    val context = getApplicationContext()

    return mapOf(
      "available" to hasGooglePlayServices(context),
      "hasPermission" to hasActivityRecognitionPermission(context),
      "started" to started,
      "message" to message,
      "lastActivity" to LaufBuddyMotionEvents.getLastPayload()
    )
  }

  private fun getApplicationContext(): Context {
    return appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("React Context ist nicht verfügbar.")
  }

  private fun hasGooglePlayServices(context: Context): Boolean {
    return GoogleApiAvailability
      .getInstance()
      .isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
  }

  private fun hasActivityRecognitionPermission(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return true
    }

    return context.checkSelfPermission(
      Manifest.permission.ACTIVITY_RECOGNITION
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun createPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, LaufBuddyMotionReceiver::class.java).apply {
      action = ACTION_ACTIVITY_TRANSITION
    }

    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_MUTABLE
      } else {
        0
      }

    return PendingIntent.getBroadcast(
      context,
      REQUEST_CODE_ACTIVITY_TRANSITION,
      intent,
      flags
    )
  }

  private fun createTransitions(): List<ActivityTransition> {
    val activities = listOf(
      DetectedActivity.RUNNING,
      DetectedActivity.WALKING,
      DetectedActivity.ON_FOOT,
      DetectedActivity.STILL
    )

    return activities.flatMap { activity ->
      listOf(
        ActivityTransition.Builder()
          .setActivityType(activity)
          .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
          .build(),
        ActivityTransition.Builder()
          .setActivityType(activity)
          .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
          .build()
      )
    }
  }

  companion object {
    private const val ACTION_ACTIVITY_TRANSITION =
      "app.laufbuddy.motion.ACTIVITY_TRANSITION"
    private const val REQUEST_CODE_ACTIVITY_TRANSITION = 19477
  }
}
