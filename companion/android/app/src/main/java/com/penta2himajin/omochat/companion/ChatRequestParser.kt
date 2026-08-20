package com.penta2himajin.omochat.companion

data class ChatMessage(
    val role: String,
    val content: String,
)

data class ChatRequest(
    val model: String,
    val messages: List<ChatMessage>,
    val stream: Boolean,
    val maxTokens: Int?,
    val temperature: Double?,
)

/**
 * Parse minimal OpenAI chat.completions JSON without a heavy JSON library for the
 * request envelope. Message bodies use org.json in callers when needed.
 */
object ChatRequestParser {
    fun parse(body: String): ChatRequest? {
        if (body.isBlank()) return null
        return try {
            val root = org.json.JSONObject(body)
            val arr = root.optJSONArray("messages") ?: return null
            val messages = ArrayList<ChatMessage>()
            for (i in 0 until arr.length()) {
                val m = arr.optJSONObject(i) ?: continue
                val role = m.optString("role")
                val content = m.optString("content")
                if (role.isNotBlank()) messages.add(ChatMessage(role, content))
            }
            if (messages.isEmpty()) return null
            ChatRequest(
                model = root.optString("model", CompanionConfig.MODEL_ID),
                messages = messages,
                stream = root.optBoolean("stream", false),
                maxTokens = if (root.has("max_tokens")) root.optInt("max_tokens") else null,
                temperature = if (root.has("temperature")) root.optDouble("temperature") else null,
            )
        } catch (_: Exception) {
            null
        }
    }

    fun systemText(messages: List<ChatMessage>): String {
        val parts = messages.filter { it.role == "system" }.map { it.content.trim() }.filter { it.isNotEmpty() }
        return if (parts.isEmpty()) CompanionConfig.DEFAULT_SYSTEM else parts.joinToString("\n")
    }

    /** Prior turns (user/assistant) excluding the final user message. */
    fun historyBeforeLastUser(messages: List<ChatMessage>): Pair<List<ChatMessage>, String>? {
        val turns = messages.filter { it.role == "user" || it.role == "assistant" }
        if (turns.isEmpty()) return null
        val last = turns.last()
        if (last.role != "user") return null
        return turns.dropLast(1) to last.content
    }
}
