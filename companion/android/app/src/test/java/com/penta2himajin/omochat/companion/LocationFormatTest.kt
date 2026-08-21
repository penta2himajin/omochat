package com.penta2himajin.omochat.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocationFormatTest {
    @Test
    fun formatsFreshFixWithAddress() {
        val text =
            LocationFormat.format(
                LocationSnapshot(
                    latitude = 35.681236,
                    longitude = 139.767125,
                    accuracyMeters = 18f,
                    fixedAtEpochMs = NOW - 5_000L,
                    isLastKnown = false,
                    address = "東京都千代田区丸の内１丁目",
                    addressAttempted = true,
                    geocoderPresent = true,
                ),
                nowEpochMs = NOW,
            )
        assertTrue(text.contains("35.681236"))
        assertTrue(text.contains("139.767125"))
        assertTrue(text.contains("accuracy_m: 18"))
        assertTrue(text.contains("fix: current"))
        assertTrue(text.contains("東京都千代田区丸の内１丁目"))
        assertFalse(text.contains("last known"))
    }

    @Test
    fun formatsStaleLastKnownWithAgeMinutes() {
        val text =
            LocationFormat.format(
                LocationSnapshot(
                    latitude = 35.0,
                    longitude = 139.0,
                    accuracyMeters = 100f,
                    fixedAtEpochMs = NOW - 12 * 60_000L,
                    isLastKnown = true,
                    address = null,
                    addressAttempted = true,
                    geocoderPresent = true,
                ),
                nowEpochMs = NOW,
            )
        assertTrue(text.contains("about 12 minutes ago (last known)"))
        assertTrue(text.contains("address: (unavailable)"))
    }

    @Test
    fun notesMissingGeocoder() {
        val text =
            LocationFormat.format(
                LocationSnapshot(
                    latitude = 1.0,
                    longitude = 2.0,
                    accuracyMeters = null,
                    fixedAtEpochMs = NOW,
                    isLastKnown = false,
                    address = null,
                    addressAttempted = true,
                    geocoderPresent = false,
                ),
                nowEpochMs = NOW,
            )
        assertTrue(text.contains("geocoder not available"))
    }

    @Test
    fun skipsAddressSectionWhenNotRequested() {
        val text =
            LocationFormat.format(
                LocationSnapshot(
                    latitude = 1.0,
                    longitude = 2.0,
                    accuracyMeters = 5f,
                    fixedAtEpochMs = NOW,
                    isLastKnown = false,
                    address = "should not appear",
                    addressAttempted = false,
                    geocoderPresent = true,
                ),
                nowEpochMs = NOW,
            )
        assertFalse(text.contains("address:"))
        assertFalse(text.contains("should not appear"))
    }

    @Test
    fun permissionDeniedMessage() {
        assertEquals(
            "Location permission is not granted. Ask the user to allow location access in omoserv.",
            LocationFormat.permissionDenied(),
        )
    }

    companion object {
        private const val NOW = 1_700_000_000_000L
    }
}
