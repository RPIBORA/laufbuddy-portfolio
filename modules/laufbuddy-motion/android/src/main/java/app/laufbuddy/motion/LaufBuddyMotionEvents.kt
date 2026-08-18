package app.laufbuddy.motion

object LaufBuddyMotionEvents {
  private const val EVENT_NAME = "onMotionActivityChanged"

  @Volatile
  private var module: LaufBuddyMotionModule? = null

  @Volatile
  private var lastPayload: Map<String, Any?> = createPayload(
    activity = "unknown",
    transition = "unknown",
    motionState = "unknown",
    moving = null,
    elapsedRealtimeNanos = null
  )

  fun attach(nextModule: LaufBuddyMotionModule) {
    module = nextModule
  }

  fun detach(detachedModule: LaufBuddyMotionModule) {
    if (module === detachedModule) {
      module = null
    }
  }

  fun getLastPayload(): Map<String, Any?> {
    return lastPayload
  }

  fun publish(
    activity: String,
    transition: String,
    motionState: String,
    moving: Boolean?,
    elapsedRealtimeNanos: Long?
  ) {
    val payload = createPayload(
      activity = activity,
      transition = transition,
      motionState = motionState,
      moving = moving,
      elapsedRealtimeNanos = elapsedRealtimeNanos
    )

    lastPayload = payload
    module?.emitMotionChanged(payload)
  }

  private fun createPayload(
    activity: String,
    transition: String,
    motionState: String,
    moving: Boolean?,
    elapsedRealtimeNanos: Long?
  ): Map<String, Any?> {
    return mapOf(
      "activity" to activity,
      "transition" to transition,
      "motionState" to motionState,
      "moving" to moving,
      "elapsedRealtimeNanos" to elapsedRealtimeNanos,
      "eventAtMs" to System.currentTimeMillis()
    )
  }
}
