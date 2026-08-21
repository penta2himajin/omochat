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
}
