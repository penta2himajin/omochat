package com.penta2himajin.omochat.companion

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicReference

/**
 * One-shot location via [LocationManager] (no Tasks.await) + optional Geocoder.
 * Hard wall-clock budget so LiteRT tool calling cannot hang the chat turn.
 */
class LocationRepository(
    private val context: Context,
    private val clockMs: () -> Long = { System.currentTimeMillis() },
) {
    fun hasLocationPermission(): Boolean {
        val fine =
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        val coarse =
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    fun lookup(includeAddress: Boolean, timeoutMs: Long = 6_000L): LocationSnapshot? {
        if (!hasLocationPermission()) {
            throw SecurityException("location permission not granted")
        }
        val exec = Executors.newSingleThreadExecutor()
        return try {
            exec.submit<LocationSnapshot?> { lookupBounded(includeAddress, timeoutMs) }
                .get(timeoutMs + 4_000L, TimeUnit.MILLISECONDS)
        } catch (e: TimeoutException) {
            Log.w(TAG, "lookup hard-timeout after ${timeoutMs + 4000}ms")
            null
        } catch (e: Exception) {
            Log.w(TAG, "lookup failed: ${e.message}", e)
            throw e
        } finally {
            exec.shutdownNow()
        }
    }

    @SuppressLint("MissingPermission")
    private fun lookupBounded(includeAddress: Boolean, timeoutMs: Long): LocationSnapshot? {
        val started = SystemClock.elapsedRealtime()
        Log.i(TAG, "lookup start includeAddress=$includeAddress budgetMs=$timeoutMs")
        val lm = context.getSystemService(LocationManager::class.java) ?: return null

        val last = bestLastKnown(lm)
        Log.i(TAG, "lastKnown=${describe(last)}")

        val remainingForFresh = (timeoutMs - (SystemClock.elapsedRealtime() - started)).coerceAtLeast(500L)
        val fresh = awaitFreshFix(lm, remainingForFresh)
        Log.i(TAG, "fresh=${describe(fresh)}")

        val (location, lastKnown) =
            when {
                fresh != null -> fresh to false
                last != null -> last to true
                else -> {
                    Log.w(TAG, "no location fix available")
                    return null
                }
            }

        val geocoderPresent = Geocoder.isPresent()
        var address: String? = null
        var addressAttempted = false
        if (includeAddress) {
            addressAttempted = true
            if (geocoderPresent) {
                val geocodeBudget =
                    (timeoutMs - (SystemClock.elapsedRealtime() - started)).coerceIn(500L, 3_000L)
                address = reverseGeocodeBounded(location.latitude, location.longitude, geocodeBudget)
                Log.i(TAG, "geocode address=${address ?: "(none)"}")
            } else {
                Log.i(TAG, "geocoder not present")
            }
        }

        return LocationSnapshot(
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyMeters = if (location.hasAccuracy()) location.accuracy else null,
            fixedAtEpochMs = location.time.takeIf { it > 0L } ?: clockMs(),
            isLastKnown = lastKnown,
            address = address,
            addressAttempted = addressAttempted,
            geocoderPresent = geocoderPresent,
        )
    }

    @SuppressLint("MissingPermission")
    private fun bestLastKnown(lm: LocationManager): Location? {
        var best: Location? = null
        for (provider in candidateProviders(lm)) {
            val loc =
                try {
                    lm.getLastKnownLocation(provider)
                } catch (e: Exception) {
                    Log.w(TAG, "getLastKnownLocation($provider): ${e.message}")
                    null
                }
            if (loc == null) continue
            if (best == null || loc.time > best.time) best = loc
        }
        return best
    }

    @SuppressLint("MissingPermission")
    private fun awaitFreshFix(lm: LocationManager, timeoutMs: Long): Location? {
        val providers = candidateProviders(lm)
        if (providers.isEmpty()) {
            Log.w(TAG, "no enabled location provider for fresh fix")
            return null
        }

        // Prefer LocationManager.getCurrentLocation when available (API 30+).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val perProvider = (timeoutMs / providers.size).coerceAtLeast(1_500L)
            for (provider in providers) {
                val loc = awaitGetCurrentLocation(lm, provider, perProvider)
                if (loc != null) return loc
            }
        }

        // Fallback: requestLocationUpdates on the first usable provider.
        return awaitLocationUpdates(lm, providers.first(), timeoutMs)
    }

    private fun candidateProviders(lm: LocationManager): List<String> {
        val out = ArrayList<String>(3)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                if (lm.isProviderEnabled(LocationManager.FUSED_PROVIDER)) {
                    out.add(LocationManager.FUSED_PROVIDER)
                }
            } catch (_: Exception) {
            }
        }
        if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            out.add(LocationManager.NETWORK_PROVIDER)
        }
        if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            out.add(LocationManager.GPS_PROVIDER)
        }
        if (out.isEmpty()) {
            // Still try common names; isProviderEnabled can be false while last-known exists.
            out.add(LocationManager.NETWORK_PROVIDER)
            out.add(LocationManager.GPS_PROVIDER)
        }
        return out.distinct()
    }

    @SuppressLint("MissingPermission")
    private fun awaitGetCurrentLocation(
        lm: LocationManager,
        provider: String,
        timeoutMs: Long,
    ): Location? {
        val latch = CountDownLatch(1)
        val ref = AtomicReference<Location?>(null)
        return try {
            Log.i(TAG, "getCurrentLocation provider=$provider budgetMs=$timeoutMs")
            lm.getCurrentLocation(
                provider,
                null,
                ContextCompat.getMainExecutor(context),
            ) { location ->
                ref.set(location)
                latch.countDown()
            }
            val ok = latch.await(timeoutMs, TimeUnit.MILLISECONDS)
            if (!ok) Log.w(TAG, "getCurrentLocation timed out provider=$provider")
            ref.get()
        } catch (e: Exception) {
            Log.w(TAG, "getCurrentLocation($provider) failed: ${e.message}", e)
            null
        }
    }

    @SuppressLint("MissingPermission")
    private fun awaitLocationUpdates(
        lm: LocationManager,
        provider: String,
        timeoutMs: Long,
    ): Location? {
        val latch = CountDownLatch(1)
        val ref = AtomicReference<Location?>(null)
        val thread = HandlerThread("omoserv-loc").also { it.start() }
        val listener =
            object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    if (ref.compareAndSet(null, location)) {
                        latch.countDown()
                    }
                }

                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

                override fun onProviderEnabled(provider: String) {}

                override fun onProviderDisabled(provider: String) {}
            }

        return try {
            Log.i(TAG, "requestLocationUpdates provider=$provider budgetMs=$timeoutMs")
            lm.requestLocationUpdates(provider, 0L, 0f, listener, thread.looper)
            val ok = latch.await(timeoutMs, TimeUnit.MILLISECONDS)
            if (!ok) Log.w(TAG, "fresh fix timed out provider=$provider after ${timeoutMs}ms")
            ref.get()
        } catch (e: Exception) {
            Log.w(TAG, "requestLocationUpdates failed: ${e.message}", e)
            null
        } finally {
            try {
                lm.removeUpdates(listener)
            } catch (_: Exception) {
            }
            thread.quitSafely()
        }
    }

    private fun reverseGeocodeBounded(
        latitude: Double,
        longitude: Double,
        timeoutMs: Long,
    ): String? {
        val exec = Executors.newSingleThreadExecutor()
        return try {
            exec.submit<String?> { reverseGeocode(latitude, longitude) }
                .get(timeoutMs, TimeUnit.MILLISECONDS)
        } catch (e: TimeoutException) {
            Log.w(TAG, "geocode timed out after ${timeoutMs}ms")
            null
        } catch (e: Exception) {
            Log.w(TAG, "geocode failed: ${e.message}", e)
            null
        } finally {
            exec.shutdownNow()
        }
    }

    private fun reverseGeocode(latitude: Double, longitude: Double): String? {
        val geocoder = Geocoder(context.applicationContext, Locale.getDefault())
        val addresses =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                awaitGeocode33(geocoder, latitude, longitude)
            } else {
                @Suppress("DEPRECATION")
                geocoder.getFromLocation(latitude, longitude, 1)
            }
        val first = addresses?.firstOrNull() ?: return null
        return formatAddress(first)
    }

    private fun awaitGeocode33(
        geocoder: Geocoder,
        latitude: Double,
        longitude: Double,
    ): List<Address>? {
        val latch = CountDownLatch(1)
        val ref = AtomicReference<List<Address>?>(null)
        geocoder.getFromLocation(latitude, longitude, 1) { list ->
            ref.set(list)
            latch.countDown()
        }
        return try {
            if (!latch.await(4, TimeUnit.SECONDS)) null else ref.get()
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            null
        }
    }

    private fun formatAddress(address: Address): String? {
        val line = address.getAddressLine(0)?.trim().orEmpty()
        if (line.isNotEmpty()) return line
        val parts =
            listOfNotNull(
                address.adminArea,
                address.locality ?: address.subLocality,
                address.thoroughfare,
                address.subThoroughfare,
                address.featureName,
                address.countryName,
            ).map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        return parts.joinToString(", ").takeIf { it.isNotEmpty() }
    }

    private fun describe(location: Location?): String {
        if (location == null) return "null"
        val ageMin = ((clockMs() - location.time).coerceAtLeast(0L) / 60_000L)
        return "lat=%.5f lon=%.5f ageMin=%d acc=%s".format(
            location.latitude,
            location.longitude,
            ageMin,
            if (location.hasAccuracy()) location.accuracy.toInt().toString() else "-",
        )
    }

    companion object {
        private const val TAG = "omoserv-loc"
    }
}
