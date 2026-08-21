package com.penta2himajin.omochat.companion

import com.google.ai.edge.litertlm.Tool
import com.google.ai.edge.litertlm.ToolParam
import com.google.ai.edge.litertlm.ToolSet
import java.time.Instant
import java.time.temporal.ChronoUnit

/** On-device calendar read tools for LiteRT-LM. */
class CalendarToolSet(
    private val repository: CalendarRepository,
) : ToolSet {
    @Tool(
        description =
            "List upcoming calendar events on this phone for the next N days (1–14). " +
                "Use for questions about schedule, meetings, or free time.",
    )
    fun getUpcomingCalendarEvents(
        @ToolParam(description = "How many days ahead to look, inclusive of today. Default 7. Max 14.")
        daysAhead: Int = 7,
    ): String {
        if (!repository.hasReadPermission()) {
            return "Calendar permission is not granted. Ask the user to allow calendar access in omoserv."
        }
        val days = daysAhead.coerceIn(1, 14)
        val begin = Instant.now()
        val end = begin.plus(days.toLong(), ChronoUnit.DAYS)
        return try {
            val events = repository.eventsBetween(begin, end)
            CalendarEventFormat.format(events)
        } catch (e: SecurityException) {
            "Calendar permission is not granted. Ask the user to allow calendar access in omoserv."
        } catch (e: Exception) {
            "Failed to read calendar: ${e.message}"
        }
    }
}
