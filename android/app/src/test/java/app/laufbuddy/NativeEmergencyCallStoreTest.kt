package app.laufbuddy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeEmergencyCallStoreTest {
  @Test fun `phone snapshot normalization is stable`() {
    assertEquals("+4912345", NativeEmergencyCallStore.normalize(" +49 (123) 45 "))
    assertEquals("12345", NativeEmergencyCallStore.normalize("12+34+5"))
  }

  @Test fun `invalid phone is rejected before persistence`() {
    assertTrue(NativeEmergencyCallStore.normalize("---").isEmpty())
  }
}
