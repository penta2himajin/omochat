package com.penta2himajin.omochat.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class SseByteQueueTest {
    @Test
    fun readerGetsAllChunksThenEof() {
        val q = SseByteQueue()
        val pool = Executors.newSingleThreadExecutor()
        pool.execute {
            q.write("data: a\n\n")
            q.write("data: b\n\n")
            q.close()
        }
        val body = q.asInputStream().bufferedReader().readText()
        assertEquals("data: a\n\ndata: b\n\n", body)
        pool.shutdown()
        assertTrue(pool.awaitTermination(2, TimeUnit.SECONDS))
    }

    @Test
    fun writeAfterCloseIsIgnored() {
        val q = SseByteQueue()
        val pool = Executors.newSingleThreadExecutor()
        pool.execute {
            q.write("ok\n")
            q.close()
            q.write("late\n")
        }
        val body = q.asInputStream().bufferedReader().readText()
        assertEquals("ok\n", body)
        pool.shutdown()
        assertTrue(pool.awaitTermination(2, TimeUnit.SECONDS))
    }
}
