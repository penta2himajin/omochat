package com.penta2himajin.omochat.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebSearchFormatTest {
    @Test
    fun formatsHitsWithProviderAndClipsLongSnippet() {
        val hits =
            listOf(
                WebSearchHit(
                    title = "Tokyo",
                    url = "https://example.com/tokyo",
                    snippet = "あ".repeat(500),
                ),
            )
        val text = WebSearchFormat.format("東京", hits, provider = "tavily")
        assertTrue(text.contains("via tavily"))
        assertTrue(text.contains("Tokyo"))
        assertTrue(text.contains("https://example.com/tokyo"))
        assertTrue(text.contains("…"))
        assertTrue(text.contains("fetchUrl"))
        assertTrue(text.length <= WebSearchFormat.TOTAL_MAX_CHARS)
    }

    @Test
    fun emptyAndBotMessages() {
        assertEquals("No web results for \"x\".", WebSearchFormat.empty("x"))
        assertTrue(WebSearchFormat.botBlocked().contains("bot challenge"))
    }
}

class DuckDuckGoHtmlParserTest {
    @Test
    fun parsesClassicHtmlResultsAndUnwrapsUddg() {
        val html =
            """
            <html><body>
            <div class="result results_links web-result">
              <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=1">Example Page</a>
              <a class="result__snippet">A short snippet about example.</a>
            </div>
            <div class="result results_links web-result">
              <a class="result__a" href="https://second.example/">Second</a>
              <div class="result__snippet">More text</div>
            </div>
            </body></html>
            """.trimIndent()
        val hits = DuckDuckGoHtmlParser.parseSearchResults(html, limit = 5)
        assertEquals(2, hits.size)
        assertEquals("Example Page", hits[0].title)
        assertEquals("https://example.com/page", hits[0].url)
        assertTrue(hits[0].snippet.contains("short snippet"))
        assertEquals("https://second.example/", hits[1].url)
    }

    @Test
    fun parsesLiteResultLinks() {
        val html =
            """
            <html><body><table>
            <tr>
              <td valign="top">1.&nbsp;</td>
              <td>
                <a rel="nofollow" class="result-link" href="https://lite.example/a">Lite Title</a>
              </td>
            </tr>
            <tr>
              <td>&nbsp;</td>
              <td class="result-snippet">Lite snippet here</td>
            </tr>
            </table></body></html>
            """.trimIndent()
        val hits = DuckDuckGoHtmlParser.parseSearchResults(html, limit = 3)
        assertEquals(1, hits.size)
        assertEquals("Lite Title", hits[0].title)
        assertEquals("https://lite.example/a", hits[0].url)
    }

    @Test
    fun detectsBotChallenge() {
        val html = """<div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div>"""
        assertTrue(DuckDuckGoHtmlParser.isBotChallenge(html))
        assertTrue(DuckDuckGoHtmlParser.parseSearchResults(html).isEmpty())
    }

    @Test
    fun extractsReadablePageText() {
        val html =
            """
            <html><head><title>Hello</title></head>
            <body><nav>nav</nav><p>Body paragraph one.</p><script>x()</script></body></html>
            """.trimIndent()
        val (title, body) = DuckDuckGoHtmlParser.extractReadableText(html)
        assertEquals("Hello", title)
        assertTrue(body.contains("Body paragraph"))
        assertFalse(body.contains("x()"))
    }
}

class GoogleHtmlParserTest {
    @Test
    fun detectsJsOnlyShell() {
        val html =
            """
            <html><body><noscript>
            <meta content="0;url=/httpservice/retry/enablejs?sei=x" http-equiv="refresh">
            </noscript><script>window.google={}</script></body></html>
            """.trimIndent()
        assertTrue(GoogleHtmlParser.isJsOnlyShell(html))
        assertTrue(GoogleHtmlParser.parseSearchResults(html).isEmpty())
    }

    @Test
    fun parsesClassicGBlocksAndUnwrapsUrlQ() {
        val html =
            """
            <html><body>
            <div class="g">
              <a href="/url?q=https%3A%2F%2Fweather.example%2Ftokyo&amp;sa=U">
                <h3>Tokyo Weather</h3>
              </a>
              <div class="VwiC3b">Forecast for Tokyo this week.</div>
            </div>
            <div class="g">
              <a href="https://news.example/tokyo"><h3>Tokyo News</h3></a>
              <span class="st">Latest headlines</span>
            </div>
            </body></html>
            """.trimIndent()
        assertFalse(GoogleHtmlParser.isJsOnlyShell(html))
        val hits = GoogleHtmlParser.parseSearchResults(html, limit = 5)
        assertEquals(2, hits.size)
        assertEquals("Tokyo Weather", hits[0].title)
        assertEquals("https://weather.example/tokyo", hits[0].url)
        assertTrue(hits[0].snippet.contains("Forecast"))
        assertEquals("https://news.example/tokyo", hits[1].url)
    }

    @Test
    fun detectsCaptchaBlock() {
        val html = """<html><body>Our systems have detected unusual traffic from your computer network</body></html>"""
        assertTrue(GoogleHtmlParser.isBlocked(html))
    }
}

class BingHtmlParserTest {
    @Test
    fun parsesBAlgoResults() {
        val html =
            """
            <html><body><ol id="b_results">
            <li class="b_algo">
              <div class="b_tpcn"><a class="tilk" href="https://support.example/a">site</a></div>
              <h2 class="">How to sign in</h2>
              <div class="b_caption"><p class="b_lineclamp3">Sign-in help article.</p></div>
            </li>
            <li class="b_algo">
              <h2><a href="https://wiki.example/tokyo">Tokyo</a></h2>
              <div class="b_caption"><p>Capital of Japan.</p></div>
            </li>
            </ol></body></html>
            """.trimIndent()
        val hits = BingHtmlParser.parseSearchResults(html, limit = 5)
        assertEquals(2, hits.size)
        assertEquals("How to sign in", hits[0].title)
        assertEquals("https://support.example/a", hits[0].url)
        assertTrue(hits[0].snippet.contains("Sign-in"))
        assertEquals("Tokyo", hits[1].title)
        assertEquals("https://wiki.example/tokyo", hits[1].url)
    }
}

class WebPageFormatTest {
    @Test
    fun formatsAndClipsBody() {
        val text = WebPageFormat.format("https://ex.test", "T", "word ".repeat(500))
        assertTrue(text.startsWith("url:"))
        assertTrue(text.contains("title: T"))
        assertTrue(text.contains("text:"))
        assertTrue(text.length < 2200)
    }
}
