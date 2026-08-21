package com.penta2himajin.omochat.companion

/** Pure formatting for the getCurrentLocation tool (testable without Android). */
data class LocationSnapshot(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float?,
    val fixedAtEpochMs: Long,
    val isLastKnown: Boolean,
    val address: String?,
    val addressAttempted: Boolean,
    val geocoderPresent: Boolean,
)

object LocationFormat {
    fun permissionDenied(): String =
        "Location permission is not granted. Ask the user to allow location access in omoserv."

    fun unavailable(detail: String): String = "Location unavailable: $detail"

    fun format(
        snapshot: LocationSnapshot,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): String {
        val lines = ArrayList<String>(8)
        lines.add("latitude: ${"%.6f".format(snapshot.latitude)}")
        lines.add("longitude: ${"%.6f".format(snapshot.longitude)}")
        val acc = snapshot.accuracyMeters
        if (acc != null && acc.isFinite() && acc > 0f) {
            lines.add("accuracy_m: ${acc.toInt().coerceAtLeast(1)}")
        }
        lines.add("fix: ${ageLine(snapshot, nowEpochMs)}")
        if (snapshot.addressAttempted) {
            val address = snapshot.address?.trim().orEmpty()
            when {
                address.isNotEmpty() -> lines.add("address: $address")
                !snapshot.geocoderPresent ->
                    lines.add("address: (unavailable; geocoder not available on this device)")
                else -> lines.add("address: (unavailable)")
            }
        }
        return lines.joinToString("\n")
    }

    private fun ageLine(snapshot: LocationSnapshot, nowEpochMs: Long): String {
        if (!snapshot.isLastKnown) return "current"
        val ageMs = (nowEpochMs - snapshot.fixedAtEpochMs).coerceAtLeast(0L)
        val minutes = (ageMs / 60_000L).coerceAtLeast(1L)
        return "about $minutes minutes ago (last known)"
    }
}
