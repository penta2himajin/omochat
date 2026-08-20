package com.penta2himajin.omochat.companion

/**
 * Convert cumulative-or-chunk streaming text into OpenAI-style deltas.
 * LiteRT-LM callbacks may deliver either full-so-far text or a fresh chunk.
 */
object StreamingText {
    data class Step(val previous: String, val delta: String)

    fun step(previous: String, incoming: String): Step {
        if (incoming.isEmpty()) return Step(previous, "")
        return if (incoming.startsWith(previous)) {
            Step(incoming, incoming.substring(previous.length))
        } else {
            Step(previous + incoming, incoming)
        }
    }
}
