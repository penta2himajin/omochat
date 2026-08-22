package com.penta2himajin.omochat.companion

import android.util.Log
import com.google.ai.edge.litertlm.Tool
import com.google.ai.edge.litertlm.ToolParam
import com.google.ai.edge.litertlm.ToolSet

/** Web search / page fetch tools (Tavily first, HTML SERP fallback + Jsoup fetch). */
class WebSearchToolSet(
    private val repository: WebSearchRepository = WebSearchRepository(),
) : ToolSet {
    @Tool(
        description =
            "Search the public web. Returns titles, URLs, and content snippets. " +
                "Use for current events, facts, or anything not on the phone. " +
                "Answer from snippets when enough; call fetchUrl only for a URL from results or the user. " +
                "May fail if the provider rate-limits or blocks the request.",
    )
    fun webSearch(
        @ToolParam(description = "Search query in Japanese or English.")
        query: String,
        @ToolParam(description = "Max results to return (1–5). Default 5.")
        maxResults: Int = 5,
    ): String {
        Log.i(TAG, "webSearch q=${query.take(80)} max=$maxResults")
        val limit = maxResults.coerceIn(1, WebSearchFormat.MAX_RESULTS)
        return when (val outcome = repository.search(query, limit)) {
            is WebSearchRepository.SearchOutcome.Ok ->
                WebSearchFormat.format(query.trim(), outcome.hits, outcome.provider)
            WebSearchRepository.SearchOutcome.BotBlocked -> WebSearchFormat.botBlocked()
            is WebSearchRepository.SearchOutcome.Err -> WebSearchFormat.error(outcome.message)
        }.also { Log.i(TAG, "webSearch result chars=${it.length}") }
    }

    @Tool(
        description =
            "Fetch a public http(s) URL and return a short plain-text extract of the page. " +
                "Use after webSearch when a specific result needs more detail. " +
                "Do not invent URLs — only use ones from webSearch or the user.",
    )
    fun fetchUrl(
        @ToolParam(description = "Full http(s) URL to fetch.")
        url: String,
    ): String {
        Log.i(TAG, "fetchUrl url=${url.take(120)}")
        return try {
            val (title, body) = repository.fetchUrl(url)
            if (body.isBlank()) {
                WebPageFormat.error("empty page body")
            } else {
                WebPageFormat.format(url.trim(), title, body)
            }
        } catch (e: Exception) {
            Log.w(TAG, "fetchUrl failed: ${e.message}", e)
            WebPageFormat.error(e.message ?: e.javaClass.simpleName)
        }.also { Log.i(TAG, "fetchUrl result chars=${it.length}") }
    }

    companion object {
        private const val TAG = "omoserv-web"
    }
}
