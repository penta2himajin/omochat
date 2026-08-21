package com.penta2himajin.omochat.companion

/** On-device speech-to-text used by OpenAI-compatible /v1/audio/transcriptions. */
interface SttEngine {
    val isAvailable: Boolean

    /** Backend label for diagnostics (e.g. os-speech / unavailable). */
    val backendLabel: String

    /**
     * Transcribe raw PCM 16-bit LE mono 16 kHz.
     * @throws SttException on recognition failure
     */
    fun transcribePcm16leMono16k(pcm: ByteArray, languageTag: String?): String
}

class SttException(
    message: String,
    val code: String = "stt_error",
) : RuntimeException(message)
