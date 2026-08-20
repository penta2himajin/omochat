package com.penta2himajin.omochat.companion

import java.io.InputStream
import java.nio.charset.StandardCharsets
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Thread-safe SSE body: producers enqueue UTF-8 chunks; NanoHTTPD reads via [asInputStream].
 * Avoids Piped* streams (JNI writer + client disconnect → uncaught Pipe closed → process death).
 */
class SseByteQueue {
    private val queue = LinkedBlockingQueue<ByteArray>()
    private val closed = AtomicBoolean(false)

    fun write(text: String) {
        if (closed.get()) return
        queue.offer(text.toByteArray(StandardCharsets.UTF_8))
    }

    fun close() {
        if (closed.compareAndSet(false, true)) {
            queue.offer(SENTINEL)
        }
    }

    fun asInputStream(): InputStream = object : InputStream() {
        private var current: ByteArray = EMPTY_CHUNK
        private var pos = 0
        private var eof = false

        override fun read(): Int {
            val one = ByteArray(1)
            val n = read(one, 0, 1)
            return if (n <= 0) -1 else one[0].toInt() and 0xff
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (eof) return -1
            if (len <= 0) return 0
            while (pos >= current.size) {
                val next = queue.take()
                if (next === SENTINEL) {
                    eof = true
                    return -1
                }
                current = next
                pos = 0
            }
            val n = minOf(len, current.size - pos)
            System.arraycopy(current, pos, b, off, n)
            pos += n
            return n
        }
    }

    companion object {
        private val EMPTY_CHUNK = ByteArray(0)
        /** Identity sentinel for end-of-stream (must not be a normal empty write). */
        private val SENTINEL = ByteArray(0)
    }
}
