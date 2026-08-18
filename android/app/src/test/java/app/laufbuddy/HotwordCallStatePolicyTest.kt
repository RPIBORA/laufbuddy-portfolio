package app.laufbuddy

import android.media.AudioManager
import android.telephony.TelephonyManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HotwordCallStatePolicyTest {
  @Test fun `first and second hotword are permitted while idle`() {
    assertTrue(canRun(callActive = false))
    assertTrue(canRun(callActive = false))
  }

  @Test fun `ringing and offhook block parallel hotwords`() {
    assertEquals(PhoneHotwordGate.ACTIVE_CALL, phoneHotwordGate(TelephonyManager.CALL_STATE_RINGING, AudioManager.MODE_NORMAL))
    assertEquals(PhoneHotwordGate.ACTIVE_CALL, phoneHotwordGate(TelephonyManager.CALL_STATE_OFFHOOK, AudioManager.MODE_IN_CALL))
    assertFalse(canRun(callActive = true))
  }

  @Test fun `idle with in-call mode waits for audio release without treating it as a call`() {
    assertEquals(PhoneHotwordGate.IDLE_AUDIO_RELEASING, phoneHotwordGate(TelephonyManager.CALL_STATE_IDLE, AudioManager.MODE_IN_CALL))
    assertTrue(canRun(callActive = false))
  }

  @Test fun `idle after audio release restarts hotword`() {
    assertEquals(PhoneHotwordGate.READY, phoneHotwordGate(TelephonyManager.CALL_STATE_IDLE, AudioManager.MODE_NORMAL))
    assertTrue(canRun(callActive = false))
  }

  @Test fun `idle audio retry budget resets for each new call and schedules no duplicate fallback`() {
    assertEquals(IdleAudioReleaseAction.RETRY, nextIdleAudioReleaseAction(0, 6, false))
    assertEquals(IdleAudioReleaseAction.FALLBACK_RETRY, nextIdleAudioReleaseAction(6, 6, false))
    assertEquals(IdleAudioReleaseAction.NONE, nextIdleAudioReleaseAction(6, 6, true))
    assertEquals(IdleAudioReleaseAction.RETRY, nextIdleAudioReleaseAction(0, 6, false))
  }

  @Test fun `disabled run hotword remains stopped after idle`() {
    assertFalse(canRun(disabledForCurrentRun = true))
  }

  @Test fun `headset is required and therefore preferred over handset`() {
    assertTrue(canRun(headsetConnected = true))
    assertFalse(canRun(headsetConnected = false))
  }

  @Test fun `headset loss stops hotword for handset fallback`() {
    assertFalse(canRun(headsetConnected = false))
  }

  @Test fun `emergency persistence is independent of call state policy`() {
    assertTrue(canRun(callActive = false))
  }

  private fun canRun(
    headsetConnected: Boolean = true,
    pausedByWebRtc: Boolean = false,
    callActive: Boolean = false,
    disabledForCurrentRun: Boolean = false,
    missingPermission: Boolean = false,
  ): Boolean = shouldRunHotword(
    headsetConnected,
    pausedByWebRtc,
    callActive,
    disabledForCurrentRun,
    missingPermission,
  )
}
