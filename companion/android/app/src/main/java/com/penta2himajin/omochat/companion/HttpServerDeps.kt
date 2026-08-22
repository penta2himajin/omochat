package com.penta2himajin.omochat.companion

/** Auth check used by CompanionHttpServer (keeps EncryptedSharedPreferences off the JVM test path). */
fun interface ApiTokenAuth {
    fun matches(candidate: String?): Boolean
}

/** Whether the on-disk LiteRT model is present (GPU load is separate). */
fun interface ModelReadiness {
    fun isReady(): Boolean
}
