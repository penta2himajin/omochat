package com.penta2himajin.omochat.companion

import android.util.Log
import java.net.URI
import java.net.URLEncoder
import org.json.JSONObject

class WebSearchRepository(
    private val http: WebHttpClient = WebHttpClient(),
    private val tavilyApiKey: String = CompanionConfig.TAVILY_API_KEY,
) {
    sealed class SearchOutcome {
        data class Ok(
            val hits: List<WebSearchHit>,
            val provider: String,
        ) : SearchOutcome()

        data object BotBlocked : SearchOutcome()

        data class Err(val message: String) : SearchOutcome()
    }

    fun search(query: String, limit: Int = WebSearchFormat.MAX_RESULTS): SearchOutcome {
        val q = query.trim()
        if (q.isEmpty()) return SearchOutcome.Err("empty query")

        val notes = ArrayList<String>()
        var sawBot = false

        when (val t = tryTavily(q, limit)) {
            is SearchOutcome.Ok -> return t
            SearchOutcome.BotBlocked -> {
                sawBot = true
                notes.add("tavily:bot")
            }
            is SearchOutcome.Err -> notes.add("tavily:${t.message}")
        }

        // Google HTML is often a JS-only shell; try Bing then DDG as keyless fallbacks.
        when (val b = tryBing(q, limit)) {
            is SearchOutcome.Ok -> return b
            SearchOutcome.BotBlocked -> {
                sawBot = true
                notes.add("bing:bot")
            }
            is SearchOutcome.Err -> notes.add("bing:${b.message}")
        }

        when (val d = tryDuckDuckGo(q, limit)) {
            is SearchOutcome.Ok -> return d
            SearchOutcome.BotBlocked -> {
                sawBot = true
                notes.add("ddg:bot")
            }
            is SearchOutcome.Err -> notes.add("ddg:${d.message}")
        }

        when (val g = tryGoogle(q, limit)) {
            is SearchOutcome.Ok -> return g
            SearchOutcome.BotBlocked -> {
                sawBot = true
                notes.add("google:bot")
            }
            is SearchOutcome.Err -> notes.add("google:${g.message}")
        }

        logW("all providers failed notes=$notes")
        return if (sawBot && notes.all { it.endsWith(":bot") }) {
            SearchOutcome.BotBlocked
        } else {
            SearchOutcome.Err(notes.joinToString("; ").ifBlank { "no results" })
        }
    }

    private fun tryTavily(query: String, limit: Int): SearchOutcome {
        return try {
            val body =
                JSONObject()
                    .put("query", query)
                    .put("max_results", limit.coerceIn(1, WebSearchFormat.MAX_RESULTS))
                    .put("search_depth", "basic")
                    .put("include_answer", false)
                    .toString()
            val headers = LinkedHashMap<String, String>()
            val key = tavilyApiKey.trim()
            val providerLabel =
                if (key.isNotEmpty()) {
                    headers["Authorization"] = "Bearer $key"
                    "tavily"
                } else {
                    headers["X-Tavily-Access-Mode"] = "keyless"
                    "tavily-keyless"
                }
            val json = http.postJson(TAVILY_SEARCH, body, headers)
            val hits = TavilySearchParser.parseSearchResults(json, limit)
            if (hits.isEmpty()) SearchOutcome.Err("empty")
            else SearchOutcome.Ok(hits, providerLabel).also {
                logI("$providerLabel ok hits=${hits.size}")
            }
        } catch (e: Exception) {
            logW("tavily search failed: ${e.message}")
            SearchOutcome.Err(e.message ?: e.javaClass.simpleName)
        }
    }

    private fun tryGoogle(query: String, limit: Int): SearchOutcome {
        return try {
            val enc = URLEncoder.encode(query, "UTF-8")
            val url = "https://www.google.com/search?q=$enc&hl=ja&gl=jp&gbv=1&num=$limit"
            val html = http.get(url)
            when {
                GoogleHtmlParser.isBlocked(html) -> {
                    logI("google blocked/captcha")
                    SearchOutcome.BotBlocked
                }
                GoogleHtmlParser.isJsOnlyShell(html) -> {
                    logI("google JS-only shell")
                    SearchOutcome.Err("js-only")
                }
                else -> {
                    val hits = GoogleHtmlParser.parseSearchResults(html, limit)
                    if (hits.isEmpty()) SearchOutcome.Err("empty")
                    else SearchOutcome.Ok(hits, "google").also {
                        logI("google ok hits=${hits.size}")
                    }
                }
            }
        } catch (e: Exception) {
            logW("google search failed: ${e.message}")
            SearchOutcome.Err(e.message ?: e.javaClass.simpleName)
        }
    }

    private fun tryBing(query: String, limit: Int): SearchOutcome {
        return try {
            val enc = URLEncoder.encode(query, "UTF-8")
            val url = "https://www.bing.com/search?q=$enc&setlang=ja-jp&count=$limit"
            val html = http.get(url)
            if (BingHtmlParser.isBlocked(html)) {
                logI("bing blocked")
                return SearchOutcome.BotBlocked
            }
            val hits = BingHtmlParser.parseSearchResults(html, limit)
            if (hits.isEmpty()) SearchOutcome.Err("empty")
            else SearchOutcome.Ok(hits, "bing").also {
                logI("bing ok hits=${hits.size}")
            }
        } catch (e: Exception) {
            logW("bing search failed: ${e.message}")
            SearchOutcome.Err(e.message ?: e.javaClass.simpleName)
        }
    }

    private fun tryDuckDuckGo(query: String, limit: Int): SearchOutcome {
        return try {
            try {
                http.get(HTML_HOME)
            } catch (e: Exception) {
                logW("ddg warm GET failed: ${e.message}")
            }
            val html =
                http.postForm(
                    HTML_SEARCH,
                    mapOf(
                        "q" to query,
                        "b" to "",
                        "kl" to "jp-jp",
                    ),
                )
            if (DuckDuckGoHtmlParser.isBotChallenge(html)) {
                val lite = http.get("$LITE_SEARCH?q=${URLEncoder.encode(query, "UTF-8")}")
                if (DuckDuckGoHtmlParser.isBotChallenge(lite)) {
                    return SearchOutcome.BotBlocked
                }
                val hits = DuckDuckGoHtmlParser.parseSearchResults(lite, limit)
                return if (hits.isEmpty()) {
                    SearchOutcome.BotBlocked
                } else {
                    SearchOutcome.Ok(hits, "duckduckgo-lite")
                }
            }
            val hits = DuckDuckGoHtmlParser.parseSearchResults(html, limit)
            if (hits.isEmpty()) SearchOutcome.Err("empty")
            else SearchOutcome.Ok(hits, "duckduckgo")
        } catch (e: Exception) {
            logW("ddg search failed: ${e.message}", e)
            SearchOutcome.Err(e.message ?: e.javaClass.simpleName)
        }
    }

    fun fetchUrl(url: String): Pair<String, String> {
        val normalized = normalizeHttpUrl(url)
            ?: throw IllegalArgumentException("only http(s) URLs are allowed")
        val html = http.get(normalized)
        return WebHtmlText.extractReadableText(html, normalized)
    }

    private fun normalizeHttpUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        return try {
            val uri = URI(trimmed)
            val scheme = uri.scheme?.lowercase()
            if (scheme != "http" && scheme != "https") return null
            if (uri.host.isNullOrBlank()) return null
            uri.toString()
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private const val TAG = "omoserv-web"
        private const val TAVILY_SEARCH = "https://api.tavily.com/search"
        private const val HTML_HOME = "https://html.duckduckgo.com/html/"
        private const val HTML_SEARCH = "https://html.duckduckgo.com/html/"
        private const val LITE_SEARCH = "https://lite.duckduckgo.com/lite/"

        /** android.util.Log throws in plain JVM unit tests unless mocked. */
        private fun logI(msg: String) {
            try {
                Log.i(TAG, msg)
            } catch (_: RuntimeException) {
                println("I/$TAG: $msg")
            }
        }

        private fun logW(msg: String, err: Throwable? = null) {
            try {
                if (err != null) Log.w(TAG, msg, err) else Log.w(TAG, msg)
            } catch (_: RuntimeException) {
                println("W/$TAG: $msg${err?.let { " (${it.message})" } ?: ""}")
            }
        }
    }
}
