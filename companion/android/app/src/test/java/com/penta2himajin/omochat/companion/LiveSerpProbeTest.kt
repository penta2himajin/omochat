package com.penta2himajin.omochat.companion

import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Optional live SERP probe. Skipped unless LIVE_WEB=1.
 *
 *   LIVE_WEB=1 ./gradlew :app:testDebugUnitTest --tests '*.LiveSerpProbeTest'
 */
class LiveSerpProbeTest {
    @Test
    fun probesGoogleBingAndDuckDuckGoFromThisNetwork() {
        assumeTrue("Set LIVE_WEB=1 to run live SERP probe", System.getenv("LIVE_WEB") == "1")

        val http = WebHttpClient()
        val report = StringBuilder()
        var anyHits = false

        // Google
        runCatching {
            val enc = java.net.URLEncoder.encode("東京 天気", "UTF-8")
            val html = http.get("https://www.google.com/search?q=$enc&hl=ja&gl=jp&gbv=1&num=5")
            val jsOnly = GoogleHtmlParser.isJsOnlyShell(html)
            val blocked = GoogleHtmlParser.isBlocked(html)
            val hits = GoogleHtmlParser.parseSearchResults(html, 5)
            report.appendLine(
                "google: bytes=${html.length} jsOnly=$jsOnly blocked=$blocked hits=${hits.size}",
            )
            hits.take(2).forEach { report.appendLine("  - ${it.title} | ${it.url}") }
            if (hits.isNotEmpty()) anyHits = true
        }.onFailure { report.appendLine("google: ERROR ${it.message}") }

        // Bing
        runCatching {
            val enc = java.net.URLEncoder.encode("東京 天気", "UTF-8")
            val html = http.get("https://www.bing.com/search?q=$enc&setlang=ja-jp&count=5")
            val blocked = BingHtmlParser.isBlocked(html)
            val hits = BingHtmlParser.parseSearchResults(html, 5)
            report.appendLine(
                "bing: bytes=${html.length} blocked=$blocked hits=${hits.size}",
            )
            hits.take(2).forEach { report.appendLine("  - ${it.title} | ${it.url}") }
            if (hits.isNotEmpty()) anyHits = true
        }.onFailure { report.appendLine("bing: ERROR ${it.message}") }

        // DuckDuckGo HTML
        runCatching {
            runCatching { http.get("https://html.duckduckgo.com/html/") }
            val html =
                http.postForm(
                    "https://html.duckduckgo.com/html/",
                    mapOf("q" to "東京 天気", "b" to "", "kl" to "jp-jp"),
                )
            val bot = DuckDuckGoHtmlParser.isBotChallenge(html)
            val hits = DuckDuckGoHtmlParser.parseSearchResults(html, 5)
            report.appendLine("ddg-html: bytes=${html.length} bot=$bot hits=${hits.size}")
            hits.take(2).forEach { report.appendLine("  - ${it.title} | ${it.url}") }
            if (hits.isNotEmpty()) anyHits = true
        }.onFailure { report.appendLine("ddg-html: ERROR ${it.message}") }

        // DuckDuckGo lite
        runCatching {
            val enc = java.net.URLEncoder.encode("東京 天気", "UTF-8")
            val html = http.get("https://lite.duckduckgo.com/lite/?q=$enc")
            val bot = DuckDuckGoHtmlParser.isBotChallenge(html)
            val hits = DuckDuckGoHtmlParser.parseSearchResults(html, 5)
            report.appendLine("ddg-lite: bytes=${html.length} bot=$bot hits=${hits.size}")
            hits.take(2).forEach { report.appendLine("  - ${it.title} | ${it.url}") }
            if (hits.isNotEmpty()) anyHits = true
        }.onFailure { report.appendLine("ddg-lite: ERROR ${it.message}") }

        // Full repository cascade
        runCatching {
            val outcome = WebSearchRepository(http).search("東京 天気", 5)
            report.appendLine("repository: $outcome")
            if (outcome is WebSearchRepository.SearchOutcome.Ok && outcome.hits.isNotEmpty()) {
                anyHits = true
                report.appendLine("repository provider=${outcome.provider} hits=${outcome.hits.size}")
                outcome.hits.take(3).forEach {
                    report.appendLine("  - ${it.title} | ${it.url}")
                }
            }
        }.onFailure { report.appendLine("repository: ERROR ${it.message}") }

        println("==== LIVE SERP PROBE ====\n$report")
        assertTrue("Expected at least one provider to return hits.\n$report", anyHits)
    }
}
