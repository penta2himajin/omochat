package com.penta2himajin.omochat.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ChatRequestParserTest {
    @Test
    fun parse_minimalUserMessage() {
        val req = ChatRequestParser.parse(
            """{"model":"gemma","messages":[{"role":"user","content":"hi"}],"stream":true}""",
        )!!
        assertEquals("gemma", req.model)
        assertEquals(true, req.stream)
        assertEquals(listOf(ChatMessage("user", "hi")), req.messages)
    }

    @Test
    fun parse_rejectsEmpty() {
        assertNull(ChatRequestParser.parse(""))
        assertNull(ChatRequestParser.parse("{}"))
    }

    @Test
    fun systemText_usesDefaultWhenMissing() {
        val messages = listOf(ChatMessage("user", "hi"))
        assertEquals(CompanionConfig.DEFAULT_SYSTEM, ChatRequestParser.systemText(messages))
    }

    @Test
    fun historyBeforeLastUser_splitsTurns() {
        val messages = listOf(
            ChatMessage("system", "sys"),
            ChatMessage("user", "u1"),
            ChatMessage("assistant", "a1"),
            ChatMessage("user", "u2"),
        )
        val (prior, last) = ChatRequestParser.historyBeforeLastUser(messages)!!
        assertEquals(listOf(ChatMessage("user", "u1"), ChatMessage("assistant", "a1")), prior)
        assertEquals("u2", last)
    }

    @Test
    fun historyBeforeLastUser_requiresTrailingUser() {
        assertNull(
            ChatRequestParser.historyBeforeLastUser(
                listOf(ChatMessage("user", "u1"), ChatMessage("assistant", "a1")),
            ),
        )
    }
}
