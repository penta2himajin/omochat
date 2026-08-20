package com.penta2himajin.omochat.companion

/** Delta text from the model; [done] marks end of generation. */
data class ChatDelta(val text: String, val done: Boolean = false)

interface LlmEngine {
    val modelId: String
    val backendLabel: String
    val isReady: Boolean

    fun ensureReady()

    /** Stream deltas for one OpenAI-style chat request. Single-flight expected by caller. */
    fun streamChat(request: ChatRequest, onDelta: (ChatDelta) -> Unit)

    fun close()
}
