package com.penta2himajin.omochat.companion

/**
 * Normalize uploaded audio to raw PCM 16-bit LE mono 16 kHz for OS STT injection.
 * Accepts headerless PCM (Even G2 / Hub format) or a simple PCM WAV.
 */
object AudioPcm {
    const val SAMPLE_RATE = 16_000
    const val BYTES_PER_SECOND = SAMPLE_RATE * 2 // mono s16le

    fun extractPcm16leMono16k(bytes: ByteArray): ByteArray? {
        if (bytes.isEmpty()) return null
        if (isWav(bytes)) {
            val pcm = readWavPcm(bytes) ?: return null
            return pcm
        }
        // Even Hub glasses mic: raw PCM 16 kHz s16le mono.
        if (bytes.size < 2 || bytes.size % 2 != 0) return null
        return bytes
    }

    private fun isWav(bytes: ByteArray): Boolean =
        bytes.size >= 12 &&
            bytes[0] == 'R'.code.toByte() &&
            bytes[1] == 'I'.code.toByte() &&
            bytes[2] == 'F'.code.toByte() &&
            bytes[3] == 'F'.code.toByte() &&
            bytes[8] == 'W'.code.toByte() &&
            bytes[9] == 'A'.code.toByte() &&
            bytes[10] == 'V'.code.toByte() &&
            bytes[11] == 'E'.code.toByte()

    private fun readWavPcm(bytes: ByteArray): ByteArray? {
        var offset = 12
        var audioFormat = -1
        var channels = -1
        var sampleRate = -1
        var bitsPerSample = -1
        var dataOffset = -1
        var dataSize = -1

        while (offset + 8 <= bytes.size) {
            val id = String(bytes, offset, 4, Charsets.US_ASCII)
            val size = readIntLe(bytes, offset + 4)
            val dataStart = offset + 8
            if (size < 0 || dataStart + size > bytes.size) return null

            when (id) {
                "fmt " -> {
                    if (size < 16) return null
                    audioFormat = readShortLe(bytes, dataStart).toInt() and 0xffff
                    channels = readShortLe(bytes, dataStart + 2).toInt() and 0xffff
                    sampleRate = readIntLe(bytes, dataStart + 4)
                    bitsPerSample = readShortLe(bytes, dataStart + 14).toInt() and 0xffff
                }
                "data" -> {
                    dataOffset = dataStart
                    dataSize = size
                }
            }
            offset = dataStart + size + (size and 1) // word align
        }

        if (audioFormat != 1) return null // PCM only
        if (channels != 1) return null
        if (sampleRate != SAMPLE_RATE) return null
        if (bitsPerSample != 16) return null
        if (dataOffset < 0 || dataSize < 0) return null
        if (dataSize % 2 != 0) return null
        return bytes.copyOfRange(dataOffset, dataOffset + dataSize)
    }

    private fun readIntLe(bytes: ByteArray, i: Int): Int =
        (bytes[i].toInt() and 0xff) or
            ((bytes[i + 1].toInt() and 0xff) shl 8) or
            ((bytes[i + 2].toInt() and 0xff) shl 16) or
            ((bytes[i + 3].toInt() and 0xff) shl 24)

    private fun readShortLe(bytes: ByteArray, i: Int): Short =
        ((bytes[i].toInt() and 0xff) or ((bytes[i + 1].toInt() and 0xff) shl 8)).toShort()
}
