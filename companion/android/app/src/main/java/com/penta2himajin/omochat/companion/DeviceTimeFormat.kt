package com.penta2himajin.omochat.companion

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Pure formatting for the get_current_time tool (testable without Android). */
object DeviceTimeFormat {
    private val localFmt: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss zzzz")

    fun format(now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
        val zoned = now.atZone(zone)
        return buildString {
            append("Local time: ")
            append(localFmt.format(zoned))
            append('\n')
            append("Time zone: ")
            append(zone.id)
            append('\n')
            append("ISO: ")
            append(zoned.toOffsetDateTime().toString())
        }
    }
}
