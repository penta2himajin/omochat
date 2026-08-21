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
    val description: String = "",
    val calendarName: String = "",
    val organizer: String = "",
)

object CalendarEventFormat {
    private val fmt: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
    private const val DESCRIPTION_MAX_CHARS = 1200

    /** Compact list for schedule overview — ids only, no description body. */
    fun formatList(
        events: List<CalendarEvent>,
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        if (events.isEmpty()) return "No calendar events in range."
        val lines = ArrayList<String>(events.size + 2)
        lines.add("${events.size} event(s):")
        lines.add("Call getCalendarEventDetails with an id for description and metadata.")
        for (e in events) {
            val whenText = whenText(e, zone)
            val loc = e.location.trim().ifEmpty { null }
            val title = e.title.ifBlank { "(no title)" }
            lines.add(
                if (loc != null) {
                    "- id=${e.id} $title ($whenText) @ $loc"
                } else {
                    "- id=${e.id} $title ($whenText)"
                },
            )
        }
        return lines.joinToString("\n")
    }

    /** @deprecated Use [formatList]. */
    fun format(
        events: List<CalendarEvent>,
        zone: ZoneId = ZoneId.systemDefault(),
    ): String = formatList(events, zone)

    fun formatDetails(
        event: CalendarEvent?,
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        if (event == null) return "No calendar event with that id."
        val lines = ArrayList<String>(8)
        lines.add("id=${event.id}")
        lines.add("title: ${event.title.ifBlank { "(no title)" }}")
        lines.add("when: ${whenText(event, zone)}")
        val loc = event.location.trim()
        if (loc.isNotEmpty()) lines.add("location: $loc")
        val cal = event.calendarName.trim()
        if (cal.isNotEmpty()) lines.add("calendar: $cal")
        val org = event.organizer.trim()
        if (org.isNotEmpty()) lines.add("organizer: $org")
        val desc = truncateDescription(event.description.trim())
        lines.add(
            if (desc.isEmpty()) {
                "description: (none)"
            } else {
                "description: $desc"
            },
        )
        return lines.joinToString("\n")
    }

    private fun whenText(e: CalendarEvent, zone: ZoneId): String =
        if (e.allDay) {
            "all-day ${e.begin.atZone(zone).toLocalDate()}"
        } else {
            val b = fmt.format(e.begin.atZone(zone))
            val end = fmt.format(e.end.atZone(zone))
            "$b – $end"
        }

    private fun truncateDescription(text: String): String {
        if (text.length <= DESCRIPTION_MAX_CHARS) return text
        return text.take(DESCRIPTION_MAX_CHARS - 1) + "…"
    }
}
