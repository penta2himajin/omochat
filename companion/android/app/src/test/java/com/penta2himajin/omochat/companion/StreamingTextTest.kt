package com.penta2himajin.omochat.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StreamingTextTest {
    @Test
    fun cumulativeUpdatesEmitSuffixOnly() {
        var prev = ""
        val s1 = StreamingText.step(prev, "こん")
        assertEquals("こん", s1.delta)
        prev = s1.previous
        val s2 = StreamingText.step(prev, "こんにちは")
        assertEquals("にちは", s2.delta)
        assertEquals("こんにちは", s2.previous)
    }

    @Test
    fun nonCumulativeChunksAppend() {
        var prev = ""
        val s1 = StreamingText.step(prev, "hello")
        prev = s1.previous
        val s2 = StreamingText.step(prev, " world")
        assertEquals(" world", s2.delta)
        assertEquals("hello world", s2.previous)
    }

    @Test
    fun emptyIncomingIsNoop() {
        val step = StreamingText.step("abc", "")
        assertEquals("abc", step.previous)
        assertEquals("", step.delta)
    }
}

class OpenAiSseTest {
    @Test
    fun chunkData_escapesNonAscii() {
        val json = OpenAiSse.chunkData("id1", "あ", null)
        assertTrue(json.contains("\\u3042"))
        assertFalse(json.contains("あ"))
    }

    @Test
    fun errorJson_isAsciiOnly() {
        val json = OpenAiSse.errorJson("失敗", "generation_error")
        assertTrue(json.contains("\\u"))
        assertFalse(json.contains("失"))
    }

    @Test
    fun modelsJson_listsIdAndReadiness() {
        val json = OpenAiSse.modelsJson(
            modelId = "gemma-4-e2b",
            modelReady = true,
            llmReady = false,
            backend = "none",
        )
        assertTrue(json.contains("gemma-4-e2b"))
        assertTrue(json.contains("\"object\":\"list\""))
        assertTrue(json.contains("\"model_ready\":true"))
        assertTrue(json.contains("\"llm_ready\":false"))
        assertTrue(json.contains("\"backend\":\"none\""))
    }
}

class JsonAsciiTest {
    @Test
    fun escapesQuotesAndUnicode() {
        assertEquals("\"hi\"", JsonAscii.string("hi"))
        assertEquals("\"a\\\"b\"", JsonAscii.string("a\"b"))
        assertEquals("\"\\u3042\"", JsonAscii.string("あ"))
    }
}
