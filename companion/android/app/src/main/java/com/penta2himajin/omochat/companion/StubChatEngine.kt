package com.penta2himajin.omochat.companion

import org.json.JSONArray
import org.json.JSONObject

/**
 * Phase 2a stub engine — fixed OpenAI-compatible replies (no LiteRT-LM yet).
 *
 * Wire JSON is ASCII-only (`\\uXXXX` for CJK) so Even WebView + NanoHTTPD
 * cannot mis-decode UTF-8 mid-stream. See hrdle glasses notes: missing glyphs
 * are dropped, not mojibake — garbled ASCII+CJK is an encoding bug.
 */
object StubChatEngine {
    const val MODEL_ID = "gemma-4-e4b-stub"
    const val MIME_JSON = "application/json; charset=utf-8"
    const val MIME_SSE = "text/event-stream; charset=utf-8"

    fun replyFor(userText: String): String {
        val clipped = userText.trim().take(80)
        return if (clipped.isEmpty()) {
            "omoserv stub: ready. (LiteRT-LM comes in Phase 2b.)"
        } else {
            "omoserv stub echo: $clipped"
        }
    }

    fun lastUserContent(messagesJson: String): String {
        if (messagesJson.isBlank()) return ""
        return try {
            val root = JSONObject(messagesJson)
            val messages = root.optJSONArray("messages") ?: return ""
            for (i in messages.length() - 1 downTo 0) {
                val msg = messages.optJSONObject(i) ?: continue
                if (msg.optString("role") == "user") {
                    return msg.optString("content")
                }
            }
            messages.optJSONObject(messages.length() - 1)?.optString("content").orEmpty()
        } catch (_: Exception) {
            ""
        }
    }

    fun wantsStream(body: String): Boolean {
        return try {
            JSONObject(body).optBoolean("stream", false)
        } catch (_: Exception) {
            false
        }
    }

    fun nonStreamJson(content: String): String {
        val id = "chatcmpl-stub-${System.currentTimeMillis()}"
        val created = System.currentTimeMillis() / 1000
        val contentJson = JsonAscii.string(content)
        return """{"id":${JsonAscii.string(id)},"object":"chat.completion","created":$created,"model":${JsonAscii.string(MODEL_ID)},"choices":[{"index":0,"message":{"role":"assistant","content":$contentJson},"finish_reason":"stop"}],"usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}}"""
    }

    fun sseBody(content: String): String {
        val id = "chatcmpl-stub-${System.currentTimeMillis()}"
        val idJson = JsonAscii.string(id)
        val contentJson = JsonAscii.string(content)
        // One event (no per-grapheme chunks) so a TCP split cannot land inside UTF-8.
        return buildString {
            append("data: {\"id\":")
            append(idJson)
            append(",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":")
            append(contentJson)
            append("},\"finish_reason\":null}]}\n\n")
            append("data: {\"id\":")
            append(idJson)
            append(",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n")
            append("data: [DONE]\n\n")
        }
    }

    fun modelsJson(): String =
        """{"object":"list","data":[{"id":${JsonAscii.string(MODEL_ID)},"object":"model","owned_by":"omoserv"}]}"""

    fun errorJson(message: String, code: String): String =
        """{"error":{"message":${JsonAscii.string(message)},"type":"invalid_request_error","code":${JsonAscii.string(code)}}}"""
}
