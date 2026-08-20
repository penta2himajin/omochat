package com.penta2himajin.omochat.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.util.concurrent.Executors

class CompanionService : Service() {

    private var server: CompanionHttpServer? = null
    private val warmPool = Executors.newSingleThreadExecutor()

    override fun onCreate() {
        super.onCreate()
        val app = application as OmoservApp

        ensureChannel()
        startForeground(NOTIFICATION_ID, buildNotification("starting…"))

        server = CompanionHttpServer(
            tokenStore = app.tokenStore,
            llm = app.llm,
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
        return START_STICKY
    }

    override fun onDestroy() {
        server?.stop()
        server = null
        (application as? OmoservApp)?.llm?.close()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

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
        private const val CHANNEL_ID = "omoserv"
        private const val NOTIFICATION_ID = 8765
        private const val SOCKET_READ_TIMEOUT = 120_000
    }
}
