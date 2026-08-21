package com.penta2himajin.omochat.companion

object CompanionConfig {
    /** Localhost only — do not expose the API on the LAN. */
    const val HOST = "127.0.0.1"
    const val PORT = 8765
    const val BASE_URL = "http://127.0.0.1:$PORT"
    const val API_BASE_URL = "$BASE_URL/v1"

    /** OpenAI model id exposed by /v1/models and chat completions. */
    const val MODEL_ID = "gemma-4-e4b"

    /** OpenAI-compatible transcriptions model id (OS SpeechRecognizer spike). */
    const val STT_MODEL_ID = "omoserv-os-stt"

    const val MODEL_FILE_NAME = "gemma-4-E4B-it-gpu.litertlm"
    const val MODEL_DOWNLOAD_URL =
        "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-gpu.litertlm"

    const val DEFAULT_SYSTEM =
        "You are a helpful assistant running on the user's phone. Answer in Japanese. " +
            "Keep responses short and useful for a wearable display. " +
            "You can call tools for the current time, phone calendar, and device location when needed. " +
            "For calendar: list with getUpcomingCalendarEvents first, then getCalendarEventDetails " +
            "with an id from that list when the user needs notes or full details. Never invent event ids. " +
            "For location: call getCurrentLocation; if the fix is labeled last known, mention how old it is."
}
