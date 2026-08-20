package com.penta2himajin.omochat.companion

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var app: OmoservApp
    private val io = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        app = application as OmoservApp

        maybeRequestNotificationPermission()
        ContextCompat.startForegroundService(
            this,
            Intent(this, CompanionService::class.java),
        )

        findViewById<TextView>(R.id.apiUrl).text = CompanionConfig.API_BASE_URL
        refreshTokenView()
        refreshModelStatus()

        findViewById<Button>(R.id.copyUrl).setOnClickListener {
            copyText(CompanionConfig.API_BASE_URL)
        }
        findViewById<Button>(R.id.copyToken).setOnClickListener {
            copyText(app.tokenStore.current())
        }
        findViewById<Button>(R.id.regenerateToken).setOnClickListener {
            confirmRegenerate()
        }
        findViewById<Button>(R.id.downloadModel).setOnClickListener {
            startDownload()
        }
        findViewById<Button>(R.id.loadModel).setOnClickListener {
            startLoad()
        }
        findViewById<Button>(R.id.chatSend).setOnClickListener {
            sendChat()
        }
    }

    override fun onResume() {
        super.onResume()
        refreshModelStatus()
    }

    private fun refreshTokenView() {
        findViewById<TextView>(R.id.apiToken).text = app.tokenStore.current()
    }

    private fun refreshModelStatus() {
        val status = findViewById<TextView>(R.id.status)
        val modelStatus = findViewById<TextView>(R.id.modelStatus)
        val downloadBtn = findViewById<Button>(R.id.downloadModel)
        status.text = "Listening on ${CompanionConfig.API_BASE_URL}\nKeep notification active."
        val bytes = app.modelStore.modelBytes()
        val mb = bytes / (1024 * 1024)
        val downloaded = app.modelStore.isReady()
        val downloading = app.modelStore.isDownloading()
        modelStatus.text = when {
            app.llm.isReady -> "ready · backend=${app.llm.backendLabel} · ${CompanionConfig.MODEL_ID} · ${mb}MB"
            downloaded -> "downloaded (${mb}MB) · tap Load model"
            downloading -> "downloading…"
            else -> "not downloaded · needs ~2.5GB free"
        }
        downloadBtn.isEnabled = !downloaded && !downloading
    }

    private fun copyText(value: String) {
        val cm = getSystemService(ClipboardManager::class.java)
        cm.setPrimaryClip(ClipData.newPlainText("omoserv", value))
        Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show()
    }

    private fun confirmRegenerate() {
        AlertDialog.Builder(this)
            .setTitle(R.string.regenerate_title)
            .setMessage(R.string.regenerate_message)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.confirm_regenerate) { _, _ ->
                app.tokenStore.regenerate()
                refreshTokenView()
            }
            .show()
    }

    private fun startDownload() {
        if (app.modelStore.isReady() || app.modelStore.isDownloading()) {
            refreshModelStatus()
            return
        }
        val modelStatus = findViewById<TextView>(R.id.modelStatus)
        val btn = findViewById<Button>(R.id.downloadModel)
        btn.isEnabled = false
        io.execute {
            try {
                app.modelStore.download { downloaded, total ->
                    val msg = if (total > 0) {
                        val pct = (downloaded * 100 / total).toInt()
                        "downloading $pct% (${downloaded / (1024 * 1024)} / ${total / (1024 * 1024)} MB)"
                    } else {
                        "downloading ${downloaded / (1024 * 1024)} MB…"
                    }
                    runOnUiThread { modelStatus.text = msg }
                }
                runOnUiThread {
                    refreshModelStatus()
                    Toast.makeText(this, "Download complete", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    modelStatus.text = "download failed: ${e.message}"
                    refreshModelStatus()
                }
            }
        }
    }

    private fun startLoad() {
        val modelStatus = findViewById<TextView>(R.id.modelStatus)
        val btn = findViewById<Button>(R.id.loadModel)
        btn.isEnabled = false
        modelStatus.text = "loading LiteRT-LM (may take ~10s)…"
        io.execute {
            try {
                app.llm.ensureReady()
                runOnUiThread {
                    btn.isEnabled = true
                    refreshModelStatus()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    btn.isEnabled = true
                    modelStatus.text = "load failed: ${e.message}"
                }
            }
        }
    }

    private fun sendChat() {
        val input = findViewById<EditText>(R.id.chatInput)
        val output = findViewById<TextView>(R.id.chatOutput)
        val message = input.text?.toString()?.trim().orEmpty()
        if (message.isEmpty()) return

        output.text = "…"
        val token = app.tokenStore.current()
        io.execute {
            val result = runCatching { postChat(message, token) }
            runOnUiThread {
                output.text = result.getOrElse { err -> "error: ${err.message}" }
            }
        }
    }

    private fun postChat(message: String, token: String): String {
        val url = URL("${CompanionConfig.API_BASE_URL}/chat/completions")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connectTimeout = 5_000
            readTimeout = 180_000
        }
        val body =
            """{"model":"${CompanionConfig.MODEL_ID}","messages":[{"role":"user","content":${jsonEscape(message)}}],"stream":false}"""
        OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
        if (code !in 200..299) throw IllegalStateException("HTTP $code: $text")
        val root = org.json.JSONObject(text)
        return root.getJSONArray("choices")
            .getJSONObject(0)
            .getJSONObject("message")
            .getString("content")
    }

    private fun jsonEscape(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

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
