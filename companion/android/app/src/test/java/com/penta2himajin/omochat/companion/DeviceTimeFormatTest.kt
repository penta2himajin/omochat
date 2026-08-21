package com.penta2himajin.omochat.companion

import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class DeviceTimeFormatTest {
    @Test
    fun formatsInstantWithZoneAndIso() {
        val instant = Instant.parse("2026-08-21T07:25:00Z")
        val zone = ZoneId.of("Asia/Tokyo")
        val text = DeviceTimeFormat.format(instant, zone)
        assertTrue(text.contains("Asia/Tokyo"))
        assertTrue(text.contains("2026-08-21"))
        assertTrue(text.contains("16:25") || text.contains("T16:25"))
        assertTrue(text.contains("ISO"))
    }
}
