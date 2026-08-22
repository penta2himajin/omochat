package com.penta2himajin.omochat.companion

import java.io.ByteArrayOutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.StandardCharsets
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * L2b: live HTTP contract against real [CompanionHttpServer] with stub LLM (no Android Context / GPU).
 */
class CompanionHttpServerContractTest {
    private lateinit var server: CompanionHttpServer
    private var port: Int = 0
    private val token = "omoserv_contract_test_token"

    @Before
    fun setUp() {
        val llm =
            object : LlmEngine {
                override val modelId: String = CompanionConfig.MODEL_ID
                override val backendLabel: String = "stub-contract"
                override val isReady: Boolean = true

                override fun ensureReady() {}

                override fun streamChat(
                    request: ChatRequest,
                    onDelta: (ChatDelta) -> Unit,
                ) {
                    val last =
                        request.messages.lastOrNull { it.role == "user" }?.content?.trim().orEmpty()
                    val reply = if (last.isEmpty()) "pong" else "echo:$last"
                    onDelta(ChatDelta(reply, done = false))
                    onDelta(ChatDelta("", done = true))
                }

                override fun close() {}
            }
        val stt =
            object : SttEngine {
                override val isAvailable: Boolean = false
                override val backendLabel: String = "unavailable"

                override fun transcribePcm16leMono16k(
                    pcm: ByteArray,
                    languageTag: String?,
                ): String = throw SttException("unused", "stt_unavailable")
            }
        server =
            CompanionHttpServer(
                tokenAuth = ApiTokenAuth { candidate -> candidate == token },
                llm = llm,
                stt = stt,
                scheduler = InferenceScheduler(),
                modelReadiness = ModelReadiness { true },
                hostname = "127.0.0.1",
                port = 0,
            )
        server.start(5_000, false)
        port = server.listeningPort
        assertTrue("ephemeral port assigned", port > 0)
    }

    @After
    fun tearDown() {
        try {
            server.stop()
        } catch (_: Exception) {
        }
    }

    @Test
    fun helloNeedsNoAuth() {
        val (code, body) = http("GET", "/hello")
        assertEquals(200, code)
        assertEquals("Hello, world", body)
    }

    @Test
    fun healthReportsServiceAndStubBackend() {
        val (code, body) = http("GET", "/health")
        assertEquals(200, code)
        val json = JSONObject(body)
        assertTrue(json.getBoolean("ok"))
        assertEquals("omoserv", json.getString("service"))
        assertTrue(json.getBoolean("model_ready"))
        assertTrue(json.getBoolean("llm_ready"))
        assertEquals("stub-contract", json.getString("backend"))
        assertFalse(json.getBoolean("stt_ready"))
    }

    @Test
    fun modelsRequiresBearerAndListsConfiguredId() {
        val (denied, deniedBody) = http("GET", "/v1/models")
        assertEquals(401, denied)
        assertTrue(deniedBody.contains("invalid_api_key"))

        val (ok, body) = http("GET", "/v1/models", bearer = token)
        assertEquals(200, ok)
        val data = JSONObject(body).getJSONArray("data")
        assertEquals(1, data.length())
        assertEquals(CompanionConfig.MODEL_ID, data.getJSONObject(0).getString("id"))
    }

    @Test
    fun chatCompletionsNonStreamEchoesUser() {
        val payload =
            """
            {"model":"${CompanionConfig.MODEL_ID}","stream":false,"messages":[{"role":"user","content":"ping"}]}
            """.trimIndent()
        val (code, body) = http("POST", "/v1/chat/completions", bearer = token, jsonBody = payload)
        assertEquals(200, code)
        val root = JSONObject(body)
        assertEquals("chat.completion", root.getString("object"))
        val content =
            root.getJSONArray("choices")
                .getJSONObject(0)
                .getJSONObject("message")
                .getString("content")
        assertEquals("echo:ping", content)
    }

    @Test
    fun chatCompletionsRejectsBadTokenAndEmptyBody() {
        val payload =
            """{"messages":[{"role":"user","content":"x"}]}"""
        val (unauthorized, errBody) =
            http("POST", "/v1/chat/completions", bearer = "wrong", jsonBody = payload)
        assertEquals(401, unauthorized)
        assertTrue("401 body=$errBody", errBody.contains("invalid_api_key"))

        val (bad, badBody) = http("POST", "/v1/chat/completions", bearer = token, jsonBody = "{}")
        assertEquals(400, bad)
        assertTrue("400 body=$badBody", badBody.contains("invalid_request"))
        assertEquals("invalid_request", JSONObject(badBody.trim()).getJSONObject("error").getString("code"))
    }

    @Test
    fun chatCompletionsStreamEndsWithDone() {
        val payload =
            """
            {"stream":true,"messages":[{"role":"user","content":"hi"}]}
            """.trimIndent()
        val (code, body) = http("POST", "/v1/chat/completions", bearer = token, jsonBody = payload)
        assertEquals(200, code)
        assertTrue(body.contains("data: "))
        assertTrue(body.contains("[DONE]"))
        assertTrue(body.contains("echo:hi") || body.contains("\\u"))
    }

    @Test
    fun modelNotReadyReturns503() {
        server.stop()
        server =
            CompanionHttpServer(
                tokenAuth = ApiTokenAuth { candidate -> candidate == token },
                llm =
                    object : LlmEngine {
                        override val modelId = CompanionConfig.MODEL_ID
                        override val backendLabel = "stub"
                        override val isReady = false

                        override fun ensureReady() {}

                        override fun streamChat(
                            request: ChatRequest,
                            onDelta: (ChatDelta) -> Unit,
                        ) {
                            error("should not run")
                        }

                        override fun close() {}
                    },
                stt =
                    object : SttEngine {
                        override val isAvailable = false
                        override val backendLabel = "unavailable"

                        override fun transcribePcm16leMono16k(
                            pcm: ByteArray,
                            languageTag: String?,
                        ) = ""
                    },
                scheduler = InferenceScheduler(),
                modelReadiness = ModelReadiness { false },
                hostname = "127.0.0.1",
                port = 0,
            )
        server.start(5_000, false)
        port = server.listeningPort

        val payload = """{"messages":[{"role":"user","content":"x"}]}"""
        val (code, body) = http("POST", "/v1/chat/completions", bearer = token, jsonBody = payload)
        assertEquals(503, code)
        assertEquals("model_not_ready", JSONObject(body).getJSONObject("error").getString("code"))
    }

    /** Raw HTTP/1.1 over a socket — avoids Android unit-test HttpURLConnection quirks. */
    private fun http(
        method: String,
        path: String,
        bearer: String? = null,
        jsonBody: String? = null,
    ): Pair<Int, String> {
        val bodyBytes = jsonBody?.toByteArray(StandardCharsets.UTF_8)
        val req = StringBuilder()
        req.append(method).append(' ').append(path).append(" HTTP/1.1\r\n")
        req.append("Host: 127.0.0.1:").append(port).append("\r\n")
        req.append("Accept: */*\r\n")
        req.append("Connection: close\r\n")
        if (bearer != null) {
            req.append("Authorization: Bearer ").append(bearer).append("\r\n")
        }
        if (bodyBytes != null) {
            req.append("Content-Type: application/json; charset=utf-8\r\n")
            req.append("Content-Length: ").append(bodyBytes.size).append("\r\n")
        }
        req.append("\r\n")
        Socket().use { socket ->
            socket.connect(InetSocketAddress("127.0.0.1", port), 3_000)
            socket.soTimeout = 10_000
            val out = socket.getOutputStream()
            out.write(req.toString().toByteArray(StandardCharsets.US_ASCII))
            if (bodyBytes != null) out.write(bodyBytes)
            out.flush()
            val raw = readAll(socket)
            val headerEnd = raw.indexOf("\r\n\r\n")
            require(headerEnd >= 0) { "no HTTP header terminator in: ${raw.take(200)}" }
            val headerText = raw.substring(0, headerEnd)
            val body = raw.substring(headerEnd + 4)
            val statusLine = headerText.lineSequence().first()
            val code =
                statusLine.split(' ').getOrNull(1)?.toIntOrNull()
                    ?: error("bad status line: $statusLine")
            return code to body
        }
    }

    private fun readAll(socket: Socket): String {
        val input = socket.getInputStream()
        val buf = ByteArrayOutputStream()
        val chunk = ByteArray(4096)
        while (true) {
            val n = input.read(chunk)
            if (n < 0) break
            buf.write(chunk, 0, n)
        }
        return buf.toString(StandardCharsets.UTF_8)
    }
}
