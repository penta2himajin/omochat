package com.penta2himajin.omochat.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class CalendarEventFormatTest {
    @Test
    fun formatsEmptyList() {
        assertEquals("No calendar events in range.", CalendarEventFormat.format(emptyList()))
    }

    @Test
    fun formatsEventsWithTitleAndWindow() {
        val events =
            listOf(
                CalendarEvent(
                    id = 1L,
                    title = "standup",
                    begin = Instant.parse("2026-08-21T01:00:00Z"),
                    end = Instant.parse("2026-08-21T01:30:00Z"),
                    allDay = false,
                    location = "Zoom",
                ),
            )
        val text = CalendarEventFormat.format(events, ZoneIdFixed)
        assertTrue(text.contains("standup"))
        assertTrue(text.contains("Zoom"))
        assertTrue(text.contains("1 event"))
    }

    companion object {
        private val ZoneIdFixed = java.time.ZoneId.of("UTC")
    }
}
