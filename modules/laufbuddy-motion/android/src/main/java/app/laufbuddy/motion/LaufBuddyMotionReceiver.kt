package app.laufbuddy.motion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

class LaufBuddyMotionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) {
      return
    }

    val result = ActivityTransitionResult.extractResult(intent) ?: return

    result.transitionEvents.forEach { event ->
      LaufBuddyMotionEvents.publish(
        activity = activityToString(event.activityType),
        transition = transitionToString(event.transitionType),
        motionState = motionStateFrom(event.activityType, event.transitionType),
        moving = movingFrom(event.activityType, event.transitionType),
        elapsedRealtimeNanos = event.elapsedRealTimeNanos
      )
    }
  }

  private fun activityToString(activityType: Int): String {
    return when (activityType) {
      DetectedActivity.RUNNING -> "running"
      DetectedActivity.WALKING -> "walking"
      DetectedActivity.ON_FOOT -> "on_foot"
      DetectedActivity.STILL -> "still"
      DetectedActivity.ON_BICYCLE -> "on_bicycle"
      DetectedActivity.IN_VEHICLE -> "in_vehicle"
      else -> "unknown"
    }
  }

  private fun transitionToString(transitionType: Int): String {
    return when (transitionType) {
      ActivityTransition.ACTIVITY_TRANSITION_ENTER -> "enter"
      ActivityTransition.ACTIVITY_TRANSITION_EXIT -> "exit"
      else -> "unknown"
    }
  }

  private fun motionStateFrom(activityType: Int, transitionType: Int): String {
    if (
      activityType == DetectedActivity.STILL &&
      transitionType == ActivityTransition.ACTIVITY_TRANSITION_EXIT
    ) {
      return "moving"
    }

    if (transitionType != ActivityTransition.ACTIVITY_TRANSITION_ENTER) {
      return "unknown"
    }

    return when (activityType) {
      DetectedActivity.RUNNING,
      DetectedActivity.WALKING,
      DetectedActivity.ON_FOOT -> "moving"

      DetectedActivity.STILL -> "still"

      else -> "unknown"
    }
  }

  private fun movingFrom(activityType: Int, transitionType: Int): Boolean? {
    if (
      activityType == DetectedActivity.STILL &&
      transitionType == ActivityTransition.ACTIVITY_TRANSITION_EXIT
    ) {
      return true
    }

    if (transitionType != ActivityTransition.ACTIVITY_TRANSITION_ENTER) {
      return null
    }

    return when (activityType) {
      DetectedActivity.RUNNING,
      DetectedActivity.WALKING,
      DetectedActivity.ON_FOOT -> true

      DetectedActivity.STILL -> false

      else -> null
    }
  }
}
