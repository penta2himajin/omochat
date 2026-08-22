package com.penta2himajin.omochat.companion

data class WebSearchHit(
    val title: String,
    val url: String,
    val snippet: String,
)

object WebSearchFormat {
    const val MAX_RESULTS = 5
    const val TITLE_MAX = 80
    /** Tavily content is richer than HTML SERP snippets; allow more per hit. */
    const val SNIPPET_MAX = 420
    const val TOTAL_MAX_CHARS = 2400

    fun empty(query: String): String = "No web results for \"$query\"."

    fun botBlocked(): String =
        "Web search blocked by provider bot challenge. Try again later, or use a different network."

    fun error(detail: String): String = "Web search failed: $detail"

    fun format(
        query: String,
        hits: List<WebSearchHit>,
        provider: String = "",
    ): String {
        if (hits.isEmpty()) return empty(query)
        val lines = ArrayList<String>(hits.size + 2)
        val via = if (provider.isNotBlank()) " via $provider" else ""
        lines.add("web_search \"$query\"$via (${hits.size}):")
        lines.add("Call fetchUrl with a URL for page text when needed.")
        for ((i, hit) in hits.withIndex()) {
            val n = i + 1
            val title = clip(hit.title.ifBlank { "(no title)" }, TITLE_MAX)
            val snippet = clip(hit.snippet, SNIPPET_MAX)
            lines.add("$n. $title")
            lines.add("   ${hit.url}")
            if (snippet.isNotEmpty()) lines.add("   $snippet")
        }
        return clipTotal(lines.joinToString("\n"), TOTAL_MAX_CHARS)
    }

    fun clip(text: String, max: Int): String {
        val t = text.replace(Regex("\\s+"), " ").trim()
        if (t.length <= max) return t
        return t.take(max - 1) + "…"
    }

    fun clipTotal(text: String, max: Int): String {
        if (text.length <= max) return text
        return text.take(max - 1) + "…"
    }
}

object WebPageFormat {
    const val BODY_MAX_CHARS = 1800

    fun format(
        url: String,
        title: String,
        body: String,
    ): String {
        val lines = ArrayList<String>(4)
        lines.add("url: $url")
        val t = title.trim()
        if (t.isNotEmpty()) lines.add("title: ${WebSearchFormat.clip(t, 120)}")
        val cleaned = body.replace(Regex("\\s+"), " ").trim()
        lines.add("text: ${WebSearchFormat.clip(cleaned, BODY_MAX_CHARS)}")
        return lines.joinToString("\n")
    }

    fun error(detail: String): String = "fetchUrl failed: $detail"
}
