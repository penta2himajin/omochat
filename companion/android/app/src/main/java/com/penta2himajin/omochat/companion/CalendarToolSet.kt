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
                "Returns compact rows with id, title, time, and location only — no description. " +
                "After picking an id, call getCalendarEventDetails for notes and metadata. " +
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
            CalendarEventFormat.formatList(events)
        } catch (e: SecurityException) {
            "Calendar permission is not granted. Ask the user to allow calendar access in omoserv."
        } catch (e: Exception) {
            "Failed to read calendar: ${e.message}"
        }
    }

    @Tool(
        description =
            "Get details for one calendar event by numeric id from getUpcomingCalendarEvents. " +
                "Includes description/notes, calendar name, and organizer when available. " +
                "Do not invent an id — only use ids returned by the list tool.",
    )
    fun getCalendarEventDetails(
        @ToolParam(description = "Event id from a prior getUpcomingCalendarEvents result (id=…). Digits only.")
        eventId: String,
    ): String {
        if (!repository.hasReadPermission()) {
            return "Calendar permission is not granted. Ask the user to allow calendar access in omoserv."
        }
        val id =
            eventId.trim().toLongOrNull()
                ?: return "Invalid event id \"$eventId\". Use a numeric id from getUpcomingCalendarEvents (id=…)."
        return try {
            CalendarEventFormat.formatDetails(repository.eventById(id))
        } catch (e: SecurityException) {
            "Calendar permission is not granted. Ask the user to allow calendar access in omoserv."
        } catch (e: Exception) {
            "Failed to read calendar event: ${e.message}"
        }
    }
}
