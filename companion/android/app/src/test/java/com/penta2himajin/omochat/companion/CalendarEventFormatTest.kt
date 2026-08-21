package com.penta2himajin.omochat.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class CalendarEventFormatTest {
    @Test
    fun formatsEmptyList() {
        assertEquals("No calendar events in range.", CalendarEventFormat.formatList(emptyList()))
    }

    @Test
    fun listIncludesStableIdWithoutDescription() {
        val events =
            listOf(
                CalendarEvent(
                    id = 42L,
                    title = "standup",
                    begin = Instant.parse("2026-08-21T01:00:00Z"),
                    end = Instant.parse("2026-08-21T01:30:00Z"),
                    allDay = false,
                    location = "Zoom",
                    description = "secret agenda that must not appear in the list",
                    calendarName = "Work",
                    organizer = "boss@example.com",
                ),
            )
        val text = CalendarEventFormat.formatList(events, ZoneIdFixed)
        assertTrue(text.contains("id=42"))
        assertTrue(text.contains("standup"))
        assertTrue(text.contains("Zoom"))
        assertTrue(text.contains("1 event"))
        assertFalse(text.contains("secret agenda"))
        assertFalse(text.contains("boss@example.com"))
    }

    @Test
    fun detailsIncludesDescriptionAndMetadata() {
        val event =
            CalendarEvent(
                id = 7L,
                title = "1:1",
                begin = Instant.parse("2026-08-21T03:00:00Z"),
                end = Instant.parse("2026-08-21T03:30:00Z"),
                allDay = false,
                location = "Room A",
                description = "Bring notes",
                calendarName = "Work",
                organizer = "alice@example.com",
            )
        val text = CalendarEventFormat.formatDetails(event, ZoneIdFixed)
        assertTrue(text.contains("id=7"))
        assertTrue(text.contains("1:1"))
        assertTrue(text.contains("Room A"))
        assertTrue(text.contains("Bring notes"))
        assertTrue(text.contains("Work"))
        assertTrue(text.contains("alice@example.com"))
    }

    @Test
    fun detailsReportsMissingEvent() {
        assertEquals("No calendar event with that id.", CalendarEventFormat.formatDetails(null))
    }

    @Test
    fun detailsTruncatesLongDescription() {
        val event =
            CalendarEvent(
                id = 1L,
                title = "long",
                begin = Instant.parse("2026-08-21T01:00:00Z"),
                end = Instant.parse("2026-08-21T02:00:00Z"),
                allDay = false,
                location = "",
                description = "あ".repeat(2000),
            )
        val text = CalendarEventFormat.formatDetails(event, ZoneIdFixed)
        assertTrue(text.contains("…"))
        assertTrue(text.length < 1800)
    }

    companion object {
        private val ZoneIdFixed: ZoneId = ZoneId.of("UTC")
    }
}
