package com.penta2himajin.omochat.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CompanionConfigTest {
    @Test
    fun usesGemma4E4bGpuLitertLm() {
        assertEquals("gemma-4-e4b", CompanionConfig.MODEL_ID)
        assertEquals("gemma-4-E4B-it-gpu.litertlm", CompanionConfig.MODEL_FILE_NAME)
        assertTrue(
            CompanionConfig.MODEL_DOWNLOAD_URL.endsWith(
                "/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-gpu.litertlm",
            ),
        )
    }
}
