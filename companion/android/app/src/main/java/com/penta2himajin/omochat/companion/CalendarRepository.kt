package com.penta2himajin.omochat.companion

import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import java.time.Instant

/** Reads device calendars via CalendarContract (READ_CALENDAR). */
class CalendarRepository(private val context: Context) {
    fun hasReadPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CALENDAR) ==
            PackageManager.PERMISSION_GRANTED

    fun eventsBetween(begin: Instant, end: Instant, limit: Int = 40): List<CalendarEvent> {
        if (!hasReadPermission()) {
            throw SecurityException("READ_CALENDAR permission not granted")
        }
        if (!end.isAfter(begin)) return emptyList()

        val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
        ContentUris.appendId(builder, begin.toEpochMilli())
        ContentUris.appendId(builder, end.toEpochMilli())

        val projection =
            arrayOf(
                CalendarContract.Instances.EVENT_ID,
                CalendarContract.Instances.TITLE,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.ALL_DAY,
                CalendarContract.Instances.EVENT_LOCATION,
            )

        val out = ArrayList<CalendarEvent>()
        context.contentResolver
            .query(
                builder.build(),
                projection,
                null,
                null,
                "${CalendarContract.Instances.BEGIN} ASC",
            )
            ?.use { cursor ->
                val idIdx = cursor.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_ID)
                val titleIdx = cursor.getColumnIndexOrThrow(CalendarContract.Instances.TITLE)
                val beginIdx = cursor.getColumnIndexOrThrow(CalendarContract.Instances.BEGIN)
                val endIdx = cursor.getColumnIndexOrThrow(CalendarContract.Instances.END)
                val allDayIdx = cursor.getColumnIndexOrThrow(CalendarContract.Instances.ALL_DAY)
                val locIdx = cursor.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_LOCATION)
                while (cursor.moveToNext() && out.size < limit) {
                    val title = cursor.getString(titleIdx) ?: ""
                    val loc = cursor.getString(locIdx) ?: ""
                    out.add(
                        CalendarEvent(
                            id = cursor.getLong(idIdx),
                            title = title,
                            begin = Instant.ofEpochMilli(cursor.getLong(beginIdx)),
                            end = Instant.ofEpochMilli(cursor.getLong(endIdx)),
                            allDay = cursor.getInt(allDayIdx) == 1,
                            location = loc,
                        ),
                    )
                }
            }
        return out
    }

    /**
     * Load one event by [CalendarContract.Events] id (the id returned in list rows).
     * Includes description and calendar metadata omitted from the compact list.
     */
    fun eventById(eventId: Long): CalendarEvent? {
        if (!hasReadPermission()) {
            throw SecurityException("READ_CALENDAR permission not granted")
        }
        if (eventId <= 0L) return null

        val projection =
            arrayOf(
                CalendarContract.Events._ID,
                CalendarContract.Events.TITLE,
                CalendarContract.Events.DTSTART,
                CalendarContract.Events.DTEND,
                CalendarContract.Events.ALL_DAY,
                CalendarContract.Events.EVENT_LOCATION,
                CalendarContract.Events.DESCRIPTION,
                CalendarContract.Events.ORGANIZER,
                CalendarContract.Events.CALENDAR_ID,
            )

        context.contentResolver
            .query(
                ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId),
                projection,
                null,
                null,
                null,
            )
            ?.use { cursor ->
                if (!cursor.moveToFirst()) return null
                val calendarId =
                    cursor.getLong(
                        cursor.getColumnIndexOrThrow(CalendarContract.Events.CALENDAR_ID),
                    )
                val dtStart = cursor.getLong(cursor.getColumnIndexOrThrow(CalendarContract.Events.DTSTART))
                val dtEndRaw = cursor.getLong(cursor.getColumnIndexOrThrow(CalendarContract.Events.DTEND))
                val allDay = cursor.getInt(cursor.getColumnIndexOrThrow(CalendarContract.Events.ALL_DAY)) == 1
                val end =
                    if (dtEndRaw > 0L) {
                        Instant.ofEpochMilli(dtEndRaw)
                    } else {
                        Instant.ofEpochMilli(dtStart)
                    }
                return CalendarEvent(
                    id = cursor.getLong(cursor.getColumnIndexOrThrow(CalendarContract.Events._ID)),
                    title = cursor.getString(cursor.getColumnIndexOrThrow(CalendarContract.Events.TITLE)) ?: "",
                    begin = Instant.ofEpochMilli(dtStart),
                    end = end,
                    allDay = allDay,
                    location =
                        cursor.getString(
                            cursor.getColumnIndexOrThrow(CalendarContract.Events.EVENT_LOCATION),
                        ) ?: "",
                    description =
                        cursor.getString(
                            cursor.getColumnIndexOrThrow(CalendarContract.Events.DESCRIPTION),
                        ) ?: "",
                    calendarName = calendarDisplayName(calendarId),
                    organizer =
                        cursor.getString(
                            cursor.getColumnIndexOrThrow(CalendarContract.Events.ORGANIZER),
                        ) ?: "",
                )
            }
        return null
    }

    private fun calendarDisplayName(calendarId: Long): String {
        if (calendarId <= 0L) return ""
        context.contentResolver
            .query(
                ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, calendarId),
                arrayOf(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME),
                null,
                null,
                null,
            )
            ?.use { cursor ->
                if (cursor.moveToFirst()) {
                    return cursor.getString(0) ?: ""
                }
            }
        return ""
    }
}
