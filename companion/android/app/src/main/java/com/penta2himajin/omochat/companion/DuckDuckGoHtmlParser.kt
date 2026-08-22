package com.penta2himajin.omochat.companion

import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.net.URLDecoder

/** Pure DuckDuckGo HTML parsers (html + lite layouts). */
object DuckDuckGoHtmlParser {
    fun isBotChallenge(html: String): Boolean {
        val lower = html.lowercase()
        return lower.contains("anomaly-modal") ||
            lower.contains("unfortunately, bots use duckduckgo") ||
            lower.contains("select all squares containing a duck")
    }

    fun parseSearchResults(html: String, limit: Int = WebSearchFormat.MAX_RESULTS): List<WebSearchHit> {
        if (isBotChallenge(html)) return emptyList()
        val doc = Jsoup.parse(html)
        val fromHtml = parseHtmlResults(doc, limit)
        if (fromHtml.isNotEmpty()) return fromHtml
        return parseLiteResults(doc, limit)
    }

    private fun parseHtmlResults(doc: Document, limit: Int): List<WebSearchHit> {
        val out = ArrayList<WebSearchHit>(limit)
        for (result in doc.select("div.result, div.web-result, div.results_links")) {
            if (out.size >= limit) break
            if (result.hasClass("result--ad") || result.selectFirst(".badge--ad") != null) continue
            val a = result.selectFirst("a.result__a") ?: continue
            val title = a.text().trim()
            val href = unwrapDuckDuckGoRedirect(a.attr("abs:href").ifBlank { a.attr("href") })
            if (title.isEmpty() || href.isEmpty()) continue
            val snippet =
                result.selectFirst("a.result__snippet, td.result__snippet, .result__snippet")
                    ?.text()
                    ?.trim()
                    .orEmpty()
            out.add(WebSearchHit(title = title, url = href, snippet = snippet))
        }
        return out
    }

    private fun parseLiteResults(doc: Document, limit: Int): List<WebSearchHit> {
        val out = ArrayList<WebSearchHit>(limit)
        // Lite: numbered rows with result-link / result-snippet
        val links = doc.select("a.result-link")
        for (a in links) {
            if (out.size >= limit) break
            val title = a.text().trim()
            val href = unwrapDuckDuckGoRedirect(a.attr("abs:href").ifBlank { a.attr("href") })
            if (title.isEmpty() || href.isEmpty()) continue
            val row = a.parents().firstOrNull { it.tagName() == "tr" }
            val snippet =
                row?.selectFirst("td.result-snippet")?.text()?.trim()
                    ?: a.parent()?.nextElementSibling()?.text()?.trim().orEmpty()
            out.add(WebSearchHit(title = title, url = href, snippet = snippet))
        }
        return out
    }

    fun unwrapDuckDuckGoRedirect(href: String): String {
        val h = href.trim()
        if (h.isEmpty()) return h
        // //duckduckgo.com/l/?uddg=<urlencoded>&rut=...
        val marker = "uddg="
        val idx = h.indexOf(marker)
        if (idx < 0) {
            return when {
                h.startsWith("//") -> "https:$h"
                else -> h
            }
        }
        val start = idx + marker.length
        val end = h.indexOf('&', start).let { if (it < 0) h.length else it }
        return try {
            URLDecoder.decode(h.substring(start, end), Charsets.UTF_8.name())
        } catch (_: Exception) {
            h
        }
    }

    fun extractReadableText(html: String, baseUri: String = ""): Pair<String, String> =
        WebHtmlText.extractReadableText(html, baseUri)
}
