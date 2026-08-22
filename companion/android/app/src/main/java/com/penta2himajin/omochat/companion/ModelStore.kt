package com.penta2himajin.omochat.companion

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

class ModelStore(context: Context) : ModelReadiness {
    private val modelsDir = File(context.filesDir, "models").also { it.mkdirs() }
    private val modelFile = File(modelsDir, CompanionConfig.MODEL_FILE_NAME)
    private val downloading = AtomicBoolean(false)

    override fun isReady(): Boolean = modelFile.exists() && modelFile.length() > 1_000_000L

    fun modelPath(): String = modelFile.absolutePath

    fun modelBytes(): Long = if (modelFile.exists()) modelFile.length() else 0L

    fun isDownloading(): Boolean = downloading.get()

    /**
     * Download the .litertlm file. Invokes [onProgress] with (downloadedBytes, totalBytesOrMinus1).
     * Hugging Face CDN redirects: follow manually so headers stay intact.
     */
    fun download(onProgress: (downloaded: Long, total: Long) -> Unit = { _, _ -> }) {
        if (isReady()) return
        if (!downloading.compareAndSet(false, true)) {
            throw IllegalStateException("download already in progress")
        }
        val partial = File(modelsDir, CompanionConfig.MODEL_FILE_NAME + ".partial")
        try {
            var url = CompanionConfig.MODEL_DOWNLOAD_URL
            var redirects = 0
            while (redirects < 8) {
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false
                    connectTimeout = 30_000
                    readTimeout = 120_000
                    requestMethod = "GET"
                    setRequestProperty("User-Agent", "omoserv/0.2")
                }
                val code = conn.responseCode
                if (code in 300..399) {
                    val next = conn.getHeaderField("Location")
                        ?: throw IllegalStateException("redirect without Location ($code)")
                    conn.disconnect()
                    url = if (next.startsWith("http")) next else URL(URL(url), next).toString()
                    redirects++
                    continue
                }
                if (code !in 200..299) {
                    val err = conn.errorStream?.bufferedReader()?.readText().orEmpty()
                    conn.disconnect()
                    throw IllegalStateException("HTTP $code downloading model: $err")
                }
                val total = conn.contentLengthLong
                conn.inputStream.use { input ->
                    FileOutputStream(partial).use { out ->
                        val buf = ByteArray(1024 * 256)
                        var downloaded = 0L
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            downloaded += n
                            onProgress(downloaded, total)
                        }
                    }
                }
                conn.disconnect()
                if (!partial.renameTo(modelFile)) {
                    partial.copyTo(modelFile, overwrite = true)
                    partial.delete()
                }
                return
            }
            throw IllegalStateException("too many redirects downloading model")
        } catch (e: Exception) {
            partial.delete()
            throw e
        } finally {
            downloading.set(false)
        }
    }
}
