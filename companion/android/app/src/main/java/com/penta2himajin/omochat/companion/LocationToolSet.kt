package com.penta2himajin.omochat.companion

import android.util.Log
import com.google.ai.edge.litertlm.Tool
import com.google.ai.edge.litertlm.ToolParam
import com.google.ai.edge.litertlm.ToolSet

/** On-device location tools for LiteRT-LM (LocationManager + Geocoder). */
class LocationToolSet(
    private val repository: LocationRepository,
) : ToolSet {
    @Tool(
        description =
            "Get the phone's current geographic location. " +
                "Returns latitude/longitude, accuracy, and optionally a reverse-geocoded address. " +
                "If a fresh fix is unavailable, falls back to the last known location and labels its age. " +
                "Use for questions about where the user is.",
    )
    fun getCurrentLocation(
        @ToolParam(
            description =
                "If true (default), reverse-geocode coordinates to an address via the device Geocoder. " +
                    "If false, return coordinates only.",
        )
        includeAddress: Boolean = true,
    ): String {
        Log.i(TAG, "getCurrentLocation includeAddress=$includeAddress")
        if (!repository.hasLocationPermission()) {
            return LocationFormat.permissionDenied()
        }
        return try {
            val snapshot = repository.lookup(includeAddress = includeAddress)
            val text =
                if (snapshot == null) {
                    LocationFormat.unavailable(
                        "no fix yet. Enable location services and try again near a window or outdoors.",
                    )
                } else {
                    LocationFormat.format(snapshot)
                }
            Log.i(TAG, "getCurrentLocation result chars=${text.length}")
            text
        } catch (e: SecurityException) {
            Log.w(TAG, "permission denied", e)
            LocationFormat.permissionDenied()
        } catch (e: Exception) {
            Log.w(TAG, "getCurrentLocation failed: ${e.message}", e)
            LocationFormat.unavailable(e.message ?: e.javaClass.simpleName)
        }
    }

    companion object {
        private const val TAG = "omoserv-loc"
    }
}
