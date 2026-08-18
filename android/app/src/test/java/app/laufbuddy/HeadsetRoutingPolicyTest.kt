package app.laufbuddy

import android.media.AudioDeviceInfo
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HeadsetRoutingPolicyTest {
  @Test fun `communication-capable bluetooth headset is recognized`() {
    assertTrue(NativeEmergencyCallStore.isCommunicationHeadsetType(AudioDeviceInfo.TYPE_BLUETOOTH_SCO))
  }

  @Test fun `a2dp-only device is not treated as a call headset`() {
    assertFalse(NativeEmergencyCallStore.isCommunicationHeadsetType(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP))
  }
}
