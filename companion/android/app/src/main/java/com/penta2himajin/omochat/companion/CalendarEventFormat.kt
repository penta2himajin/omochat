package com.penta2himajin.omochat.companion

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class CalendarEvent(
    val id: Long,
    val title: String,
    val begin: Instant,
    val end: Instant,
    val allDay: Boolean,
    val location: String,
)

object CalendarEventFormat {
    private val fmt: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    fun format(
        events: List<CalendarEvent>,
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        if (events.isEmpty()) return "No calendar events in range."
        val lines = ArrayList<String>(events.size + 1)
        lines.add("${events.size} event(s):")
        for (e in events) {
            val whenText =
                if (e.allDay) {
                    "all-day ${e.begin.atZone(zone).toLocalDate()}"
                } else {
                    val b = fmt.format(e.begin.atZone(zone))
                    val end = fmt.format(e.end.atZone(zone))
                    "$b – $end"
                }
            val loc = e.location.trim().ifEmpty { null }
            lines.add(
                if (loc != null) {
                    "- ${e.title.ifBlank { "(no title)" }} ($whenText) @ $loc"
                } else {
                    "- ${e.title.ifBlank { "(no title)" }} ($whenText)"
                },
            )
        }
        return lines.joinToString("\n")
    }
}
