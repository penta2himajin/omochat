package com.penta2himajin.omochat.companion

import fi.iki.elonen.NanoHTTPD

class CompanionHttpServer : NanoHTTPD(CompanionConfig.HOST, CompanionConfig.PORT) {

    override fun serve(session: IHTTPSession): Response {
        if (session.method == Method.OPTIONS) {
            return withCors(newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, ""))
        }

        return when (session.uri) {
            "/hello" -> withCors(
                newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, "Hello, world"),
            )
            "/health" -> withCors(
                newFixedLengthResponse(
                    Response.Status.OK,
                    "application/json",
                    """{"ok":true,"service":"omoserv","port":${CompanionConfig.PORT}}""",
                ),
            )
            else -> withCors(
                newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not found"),
            )
        }
    }

    private fun withCors(response: Response): Response {
        response.addHeader("Access-Control-Allow-Origin", "*")
        response.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        response.addHeader("Access-Control-Allow-Headers", "Content-Type")
        return response
    }
}
