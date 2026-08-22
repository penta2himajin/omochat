package com.penta2himajin.omochat.companion

import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** Minimal HTTP helper with cookie jar + timeouts for web tools. */
class WebHttpClient(
    private val userAgent: String = DEFAULT_UA,
    private val connectTimeoutMs: Int = 8_000,
    private val readTimeoutMs: Int = 12_000,
) {
    private val cookies = LinkedHashMap<String, String>()

    fun get(url: String): String = request(url, method = "GET", form = null, jsonBody = null)

    fun postForm(url: String, form: Map<String, String>): String =
        request(url, method = "POST", form = form, jsonBody = null)

    fun postJson(
        url: String,
        jsonBody: String,
        headers: Map<String, String> = emptyMap(),
    ): String = request(url, method = "POST", form = null, jsonBody = jsonBody, extraHeaders = headers)

    private fun request(
        url: String,
        method: String,
        form: Map<String, String>?,
        jsonBody: String?,
        extraHeaders: Map<String, String> = emptyMap(),
    ): String {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", userAgent)
            setRequestProperty("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
            setRequestProperty("Accept-Language", "ja,en-US;q=0.8,en;q=0.6")
            for ((k, v) in extraHeaders) {
                setRequestProperty(k, v)
            }
            if (cookies.isNotEmpty()) {
                setRequestProperty("Cookie", cookies.entries.joinToString("; ") { "${it.key}=${it.value}" })
            }
            if (form != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            }
            if (jsonBody != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
            }
        }
        try {
            when {
                form != null -> {
                    val body =
                        form.entries.joinToString("&") { (k, v) ->
                            URLEncoder.encode(k, "UTF-8") + "=" + URLEncoder.encode(v, "UTF-8")
                        }
                    OutputStreamWriter(conn.outputStream, StandardCharsets.UTF_8).use { it.write(body) }
                }
                jsonBody != null -> {
                    OutputStreamWriter(conn.outputStream, StandardCharsets.UTF_8).use { it.write(jsonBody) }
                }
            }
            val code = conn.responseCode
            storeCookies(conn)
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text =
                BufferedReader(InputStreamReader(stream ?: return "", StandardCharsets.UTF_8)).use {
                    it.readText()
                }
            if (code !in 200..299) {
                Log.w(TAG, "HTTP $code for $url (${text.length} chars)")
                throw IllegalStateException("HTTP $code")
            }
            return text
        } finally {
            conn.disconnect()
        }
    }

    private fun storeCookies(conn: HttpURLConnection) {
        val headers = conn.headerFields ?: return
        val setCookie = headers["Set-Cookie"] ?: headers["set-cookie"] ?: return
        for (raw in setCookie) {
            val part = raw.substringBefore(';').trim()
            val eq = part.indexOf('=')
            if (eq <= 0) continue
            cookies[part.substring(0, eq)] = part.substring(eq + 1)
        }
    }

    companion object {
        private const val TAG = "omoserv-web"
        const val DEFAULT_UA =
            "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"
    }
}
