package com.penta2himajin.omochat.companion

/** OpenAI-compatible SSE helpers (ASCII-only JSON). */
object OpenAiSse {
    fun modelsJson(
        modelId: String,
        ownedBy: String = "omoserv",
        created: Long = System.currentTimeMillis() / 1000,
        modelReady: Boolean,
        llmReady: Boolean,
        backend: String,
    ): String =
        """{"object":"list","data":[{"id":${JsonAscii.string(modelId)},"object":"model","created":$created,"owned_by":${JsonAscii.string(ownedBy)},"model_ready":$modelReady,"llm_ready":$llmReady,"backend":${JsonAscii.string(backend)}}]}"""

    fun nonStreamCompletion(modelId: String, content: String): String {
        val id = "chatcmpl-${System.currentTimeMillis()}"
        val created = System.currentTimeMillis() / 1000
        return """{"id":${JsonAscii.string(id)},"object":"chat.completion","created":$created,"model":${JsonAscii.string(modelId)},"choices":[{"index":0,"message":{"role":"assistant","content":${JsonAscii.string(content)}},"finish_reason":"stop"}],"usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}}"""
    }

    fun chunkData(id: String, content: String?, finish: String?): String {
        val delta = if (content != null) {
            """{"content":${JsonAscii.string(content)}}"""
        } else {
            "{}"
        }
        val finishJson = if (finish == null) "null" else JsonAscii.string(finish)
        return """{"id":${JsonAscii.string(id)},"object":"chat.completion.chunk","choices":[{"index":0,"delta":$delta,"finish_reason":$finishJson}]}"""
    }

    fun errorJson(message: String, code: String): String =
        """{"error":{"message":${JsonAscii.string(message)},"type":"invalid_request_error","code":${JsonAscii.string(code)}}}"""
}
