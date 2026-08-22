package com.penta2himajin.omochat.companion

import org.json.JSONObject

/** Parses Tavily `/search` JSON into [WebSearchHit] (title / url / content). */
object TavilySearchParser {
    fun parseSearchResults(json: String, limit: Int = WebSearchFormat.MAX_RESULTS): List<WebSearchHit> {
        if (json.isBlank() || limit <= 0) return emptyList()
        return try {
            val root = JSONObject(json)
            val arr = root.optJSONArray("results") ?: return emptyList()
            val out = ArrayList<WebSearchHit>(limit)
            for (i in 0 until arr.length()) {
                if (out.size >= limit) break
                val item = arr.optJSONObject(i) ?: continue
                val title = item.optString("title").trim()
                val url = item.optString("url").trim()
                if (url.isEmpty() || !url.startsWith("http")) continue
                val content =
                    item.optString("content").trim().ifEmpty {
                        item.optString("raw_content").trim()
                    }
                out.add(
                    WebSearchHit(
                        title = title.ifBlank { "(no title)" },
                        url = url,
                        snippet = content,
                    ),
                )
            }
            out
        } catch (_: Exception) {
            emptyList()
        }
    }
}
