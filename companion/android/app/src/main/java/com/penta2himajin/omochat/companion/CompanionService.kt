package com.penta2himajin.omochat.companion

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

class CompanionService : Service() {

    private var server: CompanionHttpServer? = null
    private val warmPool = Executors.newSingleThreadExecutor()

    override fun onCreate() {
        super.onCreate()
        val app = application as OmoservApp

        ensureChannel()
        promoteForeground("starting…")

        // Debug installs only are signed with the shared debug keystore; log token for adb spikes.
        Log.i(TAG, "debug token=${app.tokenStore.current()}")

        server = CompanionHttpServer(
            tokenStore = app.tokenStore,
            llm = app.llm,
            stt = OsSpeechSttEngine(applicationContext),
            scheduler = app.scheduler,
            modelStore = app.modelStore,
        ).also {
            it.start(SOCKET_READ_TIMEOUT, false)
        }

        notifyText("listening on ${CompanionConfig.API_BASE_URL}")

        if (app.modelStore.isReady()) {
            warmPool.execute {
                try {
                    app.llm.ensureReady()
                    notifyText("ready (${app.llm.backendLabel}) · ${CompanionConfig.API_BASE_URL}")
                } catch (e: Exception) {
                    notifyText("model on disk; load failed: ${e.message}")
                }
            }
        } else {
            notifyText("API up · download model in omoserv UI")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Re-enter foreground with microphone type after RECORD_AUDIO is granted.
        if (intent?.action == ACTION_REFRESH_FOREGROUND) {
            promoteForeground("listening on ${CompanionConfig.API_BASE_URL}")
        }
        return START_STICKY
    }

    override fun onDestroy() {
        server?.stop()
        server = null
        (application as? OmoservApp)?.llm?.close()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun hasRecordAudio(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun hasLocationPermission(): Boolean {
        val fine =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        val coarse =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    private fun foregroundTypes(): Int {
        var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        if (hasRecordAudio() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        }
        if (hasLocationPermission() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        return types
    }

    private fun promoteForeground(text: String) {
        val notification = buildNotification(text)
        val types = foregroundTypes()
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            types,
        )
        Log.i(
            TAG,
            "foreground types=$types hasRecordAudio=${hasRecordAudio()} hasLocation=${hasLocationPermission()}",
        )
    }

    private fun notifyText(text: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun ensureChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "omoserv",
            NotificationManager.IMPORTANCE_LOW,
        )
        channel.description = "Keeps the omoserv HTTP API running for omochat"
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("omoserv")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "omoserv"
        private const val CHANNEL_ID = "omoserv"
        private const val NOTIFICATION_ID = 8765
        private const val SOCKET_READ_TIMEOUT = 120_000
        const val ACTION_REFRESH_FOREGROUND = "com.penta2himajin.omochat.companion.REFRESH_FOREGROUND"
    }
}
