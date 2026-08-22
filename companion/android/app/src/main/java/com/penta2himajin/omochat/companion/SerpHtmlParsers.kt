package com.penta2himajin.omochat.companion

import org.jsoup.Jsoup
import java.net.URLDecoder

/** Shared HTML → readable text for fetchUrl. */
object WebHtmlText {
    fun extractReadableText(html: String, baseUri: String = ""): Pair<String, String> {
        val doc = Jsoup.parse(html, baseUri)
        doc.select("script, style, noscript, svg, nav, footer, header, iframe").remove()
        val title = doc.title().trim()
        val body = doc.body()?.text()?.trim().orEmpty()
        return title to body
    }
}

/** Google SERP HTML (gbv=1 / classic). Often JS-only from datacenters. */
object GoogleHtmlParser {
    fun isJsOnlyShell(html: String): Boolean {
        val lower = html.lowercase()
        return lower.contains("enablejs") ||
            lower.contains("/httpservice/retry/enablejs") ||
            (lower.contains("<noscript>") && !lower.contains("class=\"g\"") && !lower.contains("kcryt"))
    }

    fun isBlocked(html: String): Boolean {
        val lower = html.lowercase()
        return lower.contains("unusual traffic") ||
            lower.contains("/sorry/") ||
            lower.contains("detected unusual traffic") ||
            lower.contains("g-recaptcha")
    }

    fun parseSearchResults(html: String, limit: Int = WebSearchFormat.MAX_RESULTS): List<WebSearchHit> {
        if (isBlocked(html) || isJsOnlyShell(html)) return emptyList()
        val doc = Jsoup.parse(html)
        val out = ArrayList<WebSearchHit>(limit)

        // Classic desktop-ish blocks
        for (g in doc.select("div.g, div.tF2Cxc, div.Gx5Zad, div.ezO2md")) {
            if (out.size >= limit) break
            val a =
                g.selectFirst("a[href]") ?: continue
            val titleEl = g.selectFirst("h3") ?: a
            val title = titleEl.text().trim()
            val href = unwrapGoogleUrl(a.attr("abs:href").ifBlank { a.attr("href") })
            if (title.isEmpty() || href.isEmpty() || !href.startsWith("http")) continue
            if (href.contains("google.com/search")) continue
            val snippet =
                g.selectFirst("div.VwiC3b, span.aCOpRe, div.BNeawe, div.s, span.st")
                    ?.text()
                    ?.trim()
                    .orEmpty()
            out.add(WebSearchHit(title, href, snippet))
        }
        if (out.isNotEmpty()) return out

        // Mobile lite: anchors with /url?q=
        for (a in doc.select("a[href*=/url?q=]")) {
            if (out.size >= limit) break
            val href = unwrapGoogleUrl(a.attr("abs:href").ifBlank { a.attr("href") })
            val title = a.text().trim()
            if (title.isEmpty() || href.isEmpty() || !href.startsWith("http")) continue
            if (href.contains("google.")) continue
            out.add(WebSearchHit(title, href, ""))
        }
        return out.distinctBy { it.url }
    }

    fun unwrapGoogleUrl(href: String): String {
        val h = href.trim()
        if (h.isEmpty()) return h
        val marker = "/url?q="
        val idx = h.indexOf(marker)
        if (idx < 0) return h
        val start = idx + marker.length
        val end = h.indexOf('&', start).let { if (it < 0) h.length else it }
        return try {
            URLDecoder.decode(h.substring(start, end), Charsets.UTF_8.name())
        } catch (_: Exception) {
            h
        }
    }
}

/** Bing HTML SERP (`li.b_algo`). */
object BingHtmlParser {
    fun isBlocked(html: String): Boolean {
        val lower = html.lowercase()
        return lower.contains("captcha") && lower.contains("bing") &&
            !lower.contains("b_algo")
    }

    fun parseSearchResults(html: String, limit: Int = WebSearchFormat.MAX_RESULTS): List<WebSearchHit> {
        if (isBlocked(html)) return emptyList()
        val doc = Jsoup.parse(html)
        val out = ArrayList<WebSearchHit>(limit)
        for (li in doc.select("li.b_algo")) {
            if (out.size >= limit) break
            val h2 = li.selectFirst("h2") ?: continue
            val title = h2.text().trim()
            val a =
                h2.selectFirst("a[href]")
                    ?: li.selectFirst("a.tilk[href]")
                    ?: li.selectFirst("a[href^=http]")
            val href = a?.attr("abs:href")?.ifBlank { a.attr("href") }.orEmpty().trim()
            if (title.isEmpty() || href.isEmpty() || !href.startsWith("http")) continue
            val snippet =
                li.selectFirst(".b_caption p, p.b_lineclamp2, p.b_lineclamp3")
                    ?.text()
                    ?.trim()
                    .orEmpty()
            out.add(WebSearchHit(title, href, snippet))
        }
        return out
    }
}
