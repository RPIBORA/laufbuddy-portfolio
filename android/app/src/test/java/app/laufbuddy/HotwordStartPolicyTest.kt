package app.laufbuddy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HotwordStartPolicyTest {
  @Test
  fun `microphone permission is required before every hotword service start`() {
    assertEquals(
      "Mikrofonberechtigung fehlt.",
      hotwordStartBlockReason(false, true, true, true),
    )
  }

  @Test
  fun `start requires notification permission visible app and a headset`() {
    assertEquals("Benachrichtigungsberechtigung fehlt.", hotwordStartBlockReason(true, false, true, true))
    assertEquals("Hotword-Start außerhalb einer sichtbaren App nicht erlaubt.", hotwordStartBlockReason(true, true, false, true))
    assertEquals("Kein kompatibles Headset verbunden; Hotword-Dienst wird nicht benötigt.", hotwordStartBlockReason(true, true, true, false))
    assertNull(hotwordStartBlockReason(true, true, true, true))
  }
}
