package com.penta2himajin.omochat.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TavilySearchParserTest {
    @Test
    fun parsesResultsPreferringContentOverRaw() {
        val json =
            """
            {
              "query": "東京 天気",
              "results": [
                {
                  "title": "Tokyo Weather",
                  "url": "https://weather.example/tokyo",
                  "content": "Sunny, high 30C.",
                  "raw_content": "ignore me",
                  "score": 0.9
                },
                {
                  "title": "News",
                  "url": "https://news.example/a",
                  "content": "Headline about rain"
                }
              ]
            }
            """.trimIndent()
        val hits = TavilySearchParser.parseSearchResults(json, limit = 5)
        assertEquals(2, hits.size)
        assertEquals("Tokyo Weather", hits[0].title)
        assertEquals("https://weather.example/tokyo", hits[0].url)
        assertEquals("Sunny, high 30C.", hits[0].snippet)
        assertEquals("https://news.example/a", hits[1].url)
    }

    @Test
    fun respectsLimitAndSkipsInvalidEntries() {
        val json =
            """
            {
              "results": [
                {"title": "No url", "content": "x"},
                {"title": "Ok", "url": "https://ok.example/", "content": "body"},
                {"title": "Second", "url": "https://two.example/", "content": "more"}
              ]
            }
            """.trimIndent()
        val hits = TavilySearchParser.parseSearchResults(json, limit = 1)
        assertEquals(1, hits.size)
        assertEquals("Ok", hits[0].title)
    }

    @Test
    fun emptyOrMalformedReturnsEmpty() {
        assertTrue(TavilySearchParser.parseSearchResults("{}", limit = 3).isEmpty())
        assertTrue(TavilySearchParser.parseSearchResults("not-json", limit = 3).isEmpty())
        assertTrue(TavilySearchParser.parseSearchResults("", limit = 3).isEmpty())
    }
}
