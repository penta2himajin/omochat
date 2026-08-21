package com.penta2himajin.omochat.companion

import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

class CompanionHttpServer(
    private val tokenStore: TokenStore,
    private val llm: LlmEngine,
    private val stt: SttEngine,
    private val scheduler: InferenceScheduler,
    private val modelStore: ModelStore,
) : NanoHTTPD(CompanionConfig.HOST, CompanionConfig.PORT) {

    private val streamPool = Executors.newCachedThreadPool()

    override fun serve(session: IHTTPSession): Response {
        if (session.method == Method.OPTIONS) {
            return withCors(newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, ""))
        }

        val path = session.uri.substringBefore('?')

        return when {
            path == "/hello" -> withCors(
                newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, "Hello, world"),
            )
            path == "/health" -> json(
                Response.Status.OK,
                """{"ok":true,"service":"omoserv","port":${CompanionConfig.PORT},"model_ready":${modelStore.isReady()},"llm_ready":${llm.isReady},"backend":${JsonAscii.string(llm.backendLabel)},"stt_ready":${stt.isAvailable},"stt_backend":${JsonAscii.string(stt.backendLabel)}}""",
            )
            path == "/v1/models" -> requireAuth(session) {
                json(
                    Response.Status.OK,
                    OpenAiSse.modelsJson(
                        modelId = CompanionConfig.MODEL_ID,
                        modelReady = modelStore.isReady(),
                        llmReady = llm.isReady,
                        backend = llm.backendLabel,
                    ),
                )
            }
            path == "/v1/chat/completions" -> requireAuth(session) {
                if (session.method != Method.POST) {
                    return@requireAuth jsonError(Response.Status.METHOD_NOT_ALLOWED, "Method not allowed", "method_not_allowed")
                }
                handleChatCompletions(session)
            }
            path == "/v1/audio/transcriptions" -> requireAuth(session) {
                if (session.method != Method.POST) {
                    return@requireAuth jsonError(Response.Status.METHOD_NOT_ALLOWED, "Method not allowed", "method_not_allowed")
                }
                handleTranscriptions(session)
            }
            else -> withCors(
                newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not found"),
            )
        }
    }

    private fun handleChatCompletions(session: IHTTPSession): Response {
        val body = readUtf8Body(session)
        val request = ChatRequestParser.parse(body)
            ?: return jsonError(Response.Status.BAD_REQUEST, "Invalid chat request", "invalid_request")

        if (!modelStore.isReady()) {
            return jsonError(
                Response.Status.SERVICE_UNAVAILABLE,
                "Model not downloaded. Open omoserv and tap Download model.",
                "model_not_ready",
            )
        }

        return if (request.stream) {
            streamChat(request)
        } else {
            try {
                val sb = StringBuilder()
                scheduler.runExclusive {
                    llm.streamChat(request) { delta ->
                        if (!delta.done) sb.append(delta.text)
                    }
                }
                json(Response.Status.OK, OpenAiSse.nonStreamCompletion(CompanionConfig.MODEL_ID, sb.toString()))
            } catch (e: Throwable) {
                jsonError(Response.Status.INTERNAL_ERROR, e.message ?: "generation failed", "generation_error")
            }
        }
    }

    private fun streamChat(request: ChatRequest): Response {
        val queue = SseByteQueue()
        streamPool.execute {
            try {
                val id = "chatcmpl-${System.currentTimeMillis()}"
                // Kick the stream immediately so the client / NanoHTTPD start reading
                // before the first model token (avoids idle disconnects).
                queue.write(": omoserv-stream\n\n")
                queue.write("data: ${OpenAiSse.chunkData(id, null, null)}\n\n")
                scheduler.runExclusive {
                    llm.streamChat(request) { delta ->
                        if (delta.done) {
                            queue.write("data: ${OpenAiSse.chunkData(id, null, "stop")}\n\n")
                            queue.write("data: [DONE]\n\n")
                        } else if (delta.text.isNotEmpty()) {
                            queue.write("data: ${OpenAiSse.chunkData(id, delta.text, null)}\n\n")
                        }
                    }
                }
            } catch (e: Throwable) {
                queue.write("data: ${OpenAiSse.errorJson(e.message ?: "generation failed", "generation_error")}\n\n")
                queue.write("data: [DONE]\n\n")
            } finally {
                queue.close()
            }
        }
        return withCors(
            newChunkedResponse(Response.Status.OK, StubChatEngine.MIME_SSE, queue.asInputStream()),
        ).also {
            it.addHeader("Cache-Control", "no-cache")
            it.addHeader("Connection", "keep-alive")
        }
    }

    private fun handleTranscriptions(session: IHTTPSession): Response {
        if (!stt.isAvailable) {
            return jsonError(
                Response.Status.SERVICE_UNAVAILABLE,
                "Speech recognition unavailable on this device",
                "stt_unavailable",
            )
        }

        val files = HashMap<String, String>()
        try {
            session.parseBody(files)
        } catch (e: Exception) {
            return jsonError(
                Response.Status.BAD_REQUEST,
                e.message ?: "Failed to parse multipart body",
                "invalid_request",
            )
        }

        val tempPath = files["file"] ?: files["audio"]
            ?: return jsonError(Response.Status.BAD_REQUEST, "Missing multipart file field", "invalid_request")

        val language = session.parms["language"]?.trim()?.ifEmpty { null }
        val languageTag = when (language?.lowercase()) {
            null -> null
            "ja" -> "ja-JP"
            "en" -> "en-US"
            else -> language
        }

        return try {
            val bytes = java.io.File(tempPath).readBytes()
            val pcm = AudioPcm.extractPcm16leMono16k(bytes)
                ?: return jsonError(
                    Response.Status.BAD_REQUEST,
                    "Unsupported audio: need PCM s16le mono 16kHz (raw or WAV)",
                    "invalid_request",
                )
            val text = scheduler.runExclusive {
                stt.transcribePcm16leMono16k(pcm, languageTag)
            }
            json(Response.Status.OK, OpenAiSse.transcriptionJson(text))
        } catch (e: SttException) {
            val status =
                if (e.code == "stt_unavailable") Response.Status.SERVICE_UNAVAILABLE
                else Response.Status.INTERNAL_ERROR
            jsonError(status, e.message ?: "transcription failed", e.code)
        } catch (e: Throwable) {
            jsonError(Response.Status.INTERNAL_ERROR, e.message ?: "transcription failed", "stt_error")
        } finally {
            try {
                java.io.File(tempPath).delete()
            } catch (_: Throwable) {
            }
        }
    }

    private fun requireAuth(session: IHTTPSession, block: () -> Response): Response {
        val token = extractBearer(session)
        if (!tokenStore.matches(token)) {
            return jsonError(Response.Status.UNAUTHORIZED, "Invalid API token", "invalid_api_key")
        }
        return block()
    }

    private fun extractBearer(session: IHTTPSession): String? {
        val header = session.headers["authorization"] ?: return null
        if (!header.startsWith("Bearer ", ignoreCase = true)) return null
        return header.substring(7).trim().ifEmpty { null }
    }

    private fun readUtf8Body(session: IHTTPSession): String {
        val length = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (length <= 0) return ""
        val input = session.inputStream
        val buf = ByteArray(length)
        var offset = 0
        while (offset < length) {
            val n = input.read(buf, offset, length - offset)
            if (n < 0) break
            offset += n
        }
        return String(buf, 0, offset, StandardCharsets.UTF_8)
    }

    private fun json(status: Response.Status, body: String): Response {
        val bytes = body.toByteArray(StandardCharsets.UTF_8)
        return withCors(
            newFixedLengthResponse(
                status,
                StubChatEngine.MIME_JSON,
                ByteArrayInputStream(bytes),
                bytes.size.toLong(),
            ),
        )
    }

    private fun jsonError(status: Response.Status, message: String, code: String): Response =
        json(status, OpenAiSse.errorJson(message, code))

    private fun withCors(response: Response): Response {
        response.addHeader("Access-Control-Allow-Origin", "*")
        response.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        response.addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
        return response
    }
}
