package com.penta2himajin.omochat.companion

import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/** Serialize LLM (and future STT) so only one heavy job runs at a time. */
class InferenceScheduler {
    private val lock = ReentrantLock()

    fun <T> runExclusive(block: () -> T): T = lock.withLock(block)
}
