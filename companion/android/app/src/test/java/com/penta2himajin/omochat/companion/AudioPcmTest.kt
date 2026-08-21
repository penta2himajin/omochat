package com.penta2himajin.omochat.companion

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class AudioPcmTest {
    @Test
    fun extract_rawPcmPassthrough() {
        val pcm = byteArrayOf(0, 1, 2, 3)
        assertArrayEquals(pcm, AudioPcm.extractPcm16leMono16k(pcm))
    }

    @Test
    fun extract_rejectsOddLengthRaw() {
        assertNull(AudioPcm.extractPcm16leMono16k(byteArrayOf(1)))
    }

    @Test
    fun extract_wavMono16kPcm() {
        val pcm = shortArrayOf(100, -100, 200, -200).toLeBytes()
        val wav = buildWav(pcm, sampleRate = 16_000, channels = 1, bits = 16)
        assertArrayEquals(pcm, AudioPcm.extractPcm16leMono16k(wav))
    }

    @Test
    fun extract_rejectsStereoWav() {
        val pcm = shortArrayOf(1, 2, 3, 4).toLeBytes()
        val wav = buildWav(pcm, sampleRate = 16_000, channels = 2, bits = 16)
        assertNull(AudioPcm.extractPcm16leMono16k(wav))
    }

    private fun ShortArray.toLeBytes(): ByteArray {
        val buf = ByteBuffer.allocate(size * 2).order(ByteOrder.LITTLE_ENDIAN)
        forEach { buf.putShort(it) }
        return buf.array()
    }

    private fun buildWav(pcm: ByteArray, sampleRate: Int, channels: Int, bits: Int): ByteArray {
        val byteRate = sampleRate * channels * bits / 8
        val blockAlign = channels * bits / 8
        val dataSize = pcm.size
        val buf = ByteBuffer.allocate(44 + dataSize).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray(Charsets.US_ASCII))
        buf.putInt(36 + dataSize)
        buf.put("WAVE".toByteArray(Charsets.US_ASCII))
        buf.put("fmt ".toByteArray(Charsets.US_ASCII))
        buf.putInt(16)
        buf.putShort(1) // PCM
        buf.putShort(channels.toShort())
        buf.putInt(sampleRate)
        buf.putInt(byteRate)
        buf.putShort(blockAlign.toShort())
        buf.putShort(bits.toShort())
        buf.put("data".toByteArray(Charsets.US_ASCII))
        buf.putInt(dataSize)
        buf.put(pcm)
        return buf.array()
    }
}
