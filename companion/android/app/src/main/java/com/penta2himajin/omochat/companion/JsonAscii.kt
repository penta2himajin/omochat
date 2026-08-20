package com.penta2himajin.omochat.companion

/**
 * ASCII-only JSON strings so NanoHTTPD / WebView never re-decode UTF-8 payloads.
 * Mirrors JSON.stringify's \\uXXXX form for non-ASCII.
 */
object JsonAscii {
    fun string(value: String): String {
        val sb = StringBuilder(value.length + 2)
        sb.append('"')
        var i = 0
        while (i < value.length) {
            val cp = value.codePointAt(i)
            when (cp) {
                0x22 -> sb.append("\\\"") // "
                0x5c -> sb.append("\\\\")
                0x0a -> sb.append("\\n")
                0x0d -> sb.append("\\r")
                0x09 -> sb.append("\\t")
                else -> if (cp >= 0x20 && cp <= 0x7e) {
                    sb.append(cp.toChar())
                } else {
                    if (cp > 0xffff) {
                        val chars = Character.toChars(cp)
                        for (ch in chars) appendBmpEscape(sb, ch.code)
                    } else {
                        appendBmpEscape(sb, cp)
                    }
                }
            }
            i += Character.charCount(cp)
        }
        sb.append('"')
        return sb.toString()
    }

    private fun appendBmpEscape(sb: StringBuilder, cp: Int) {
        sb.append("\\u")
        val hex = Integer.toHexString(cp)
        repeat(4 - hex.length) { sb.append('0') }
        sb.append(hex)
    }
}
