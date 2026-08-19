package com.penta2himajin.omochat.companion

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val status = findViewById<TextView>(R.id.status)
        status.text = "Starting HTTP server on ${CompanionConfig.BASE_URL}/hello …"

        maybeRequestNotificationPermission()

        ContextCompat.startForegroundService(
            this,
            Intent(this, CompanionService::class.java),
        )

        status.text = buildString {
            appendLine("omochat companion")
            appendLine("GET ${CompanionConfig.BASE_URL}/hello")
            appendLine("GET ${CompanionConfig.BASE_URL}/health")
            appendLine()
            append("Keep this app running (notification).")
        }
    }

    private fun maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            1,
        )
    }
}
