import { describe, expect, it, vi } from 'vitest'
import { createOpenAiClient, parseSseChatStream } from './client.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createOpenAiClient', () => {
  it('sends Bearer token and lists models', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:8765/v1/models')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer omoserv_test')
      expect(new Headers(init?.headers).get('Content-Type')).toContain('charset=utf-8')
      return jsonResponse(200, {
        object: 'list',
        data: [
          {
            id: 'gemma-4-e2b',
            object: 'model',
            owned_by: 'omoserv',
            model_ready: true,
            llm_ready: true,
            backend: 'gpu',
          },
        ],
      })
    }) as unknown as typeof fetch

    const client = createOpenAiClient({
      baseUrl: 'http://127.0.0.1:8765/v1/',
      token: 'omoserv_test',
      fetchImpl,
    })
    const models = await client.listModels()
    expect(models).toEqual([
      {
        id: 'gemma-4-e2b',
        owned_by: 'omoserv',
        model_ready: true,
        llm_ready: true,
        backend: 'gpu',
      },
    ])
  })

  it('fetches /health from service root', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:8765/health')
      return jsonResponse(200, {
        ok: true,
        service: 'omoserv',
        port: 8765,
        model_ready: true,
        llm_ready: false,
        backend: 'none',
      })
    }) as unknown as typeof fetch

    const client = createOpenAiClient({
      baseUrl: 'http://127.0.0.1:8765/v1',
      token: 't',
      fetchImpl,
    })
    await expect(client.getHealth()).resolves.toEqual({
      ok: true,
      service: 'omoserv',
      port: 8765,
      model_ready: true,
      llm_ready: false,
      backend: 'none',
    })
  })

  it('throws OpenAiError on 401', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, {
        error: { message: 'Invalid API token', type: 'invalid_request_error', code: 'invalid_api_key' },
      }),
    ) as unknown as typeof fetch

    const client = createOpenAiClient({
      baseUrl: 'http://127.0.0.1:8765/v1',
      token: 'bad',
      fetchImpl,
    })
    await expect(client.listModels()).rejects.toMatchObject({
      status: 401,
      message: 'Invalid API token',
      code: 'invalid_api_key',
    })
    await expect(client.listModels()).rejects.toBeInstanceOf(Error)
  })

  it('decodes JSON unicode escapes in SSE payloads', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"omoserv stub echo: WebGPU\\u306b\\u3064\\u3044\\u3066"}}]}\n\n' +
      'data: [DONE]\n\n'
    const fetchImpl = vi.fn(async () =>
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }),
    ) as unknown as typeof fetch
    const client = createOpenAiClient({
      baseUrl: 'http://127.0.0.1:8765/v1',
      token: 't',
      fetchImpl,
    })
    const parts: string[] = []
    for await (const t of client.streamChatCompletion({
      model: 'x',
      messages: [{ role: 'user', content: 'x' }],
    })) {
      parts.push(t)
    }
    expect(parts.join('')).toBe('omoserv stub echo: WebGPUについて')
  })

  it('streams SSE content deltas', async () => {
    const sse = [
      'data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"こん"},"finish_reason":null}]}',
      '',
      'data: {"id":"c1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"にちは"},"finish_reason":null}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const fetchImpl = vi.fn(async () =>
      new Response(sse, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    ) as unknown as typeof fetch

    const client = createOpenAiClient({
      baseUrl: 'http://127.0.0.1:8765/v1',
      token: 'omoserv_test',
      fetchImpl,
    })

    const parts: string[] = []
    for await (const t of client.streamChatCompletion({
      model: 'gemma-4-e4b',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      parts.push(t)
    }
    expect(parts.join('')).toBe('こんにちは')
  })

  it('wraps fetch failures as OpenAiClientError network_error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const client = createOpenAiClient({
      baseUrl: 'http://127.0.0.1:8765/v1',
      token: 't',
      fetchImpl,
    })
    await expect(
      (async () => {
        for await (const _ of client.streamChatCompletion({
          model: 'x',
          messages: [{ role: 'user', content: 'hi' }],
        })) {
          // drain
        }
      })(),
    ).rejects.toMatchObject({
      name: 'OpenAiClientError',
      code: 'network_error',
      message: 'Failed to fetch',
      status: 0,
    })
  })

  it('surfaces SSE error payloads as OpenAiClientError', async () => {
    const sse =
      'data: {"error":{"message":"generation failed","code":"generation_error"}}\n\n' +
      'data: [DONE]\n\n'
    const fetchImpl = vi.fn(async () =>
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    ) as unknown as typeof fetch
    const client = createOpenAiClient({
      baseUrl: 'http://127.0.0.1:8765/v1',
      token: 't',
      fetchImpl,
    })
    await expect(
      (async () => {
        for await (const _ of client.streamChatCompletion({
          model: 'x',
          messages: [{ role: 'user', content: 'hi' }],
        })) {
          // drain
        }
      })(),
    ).rejects.toMatchObject({
      name: 'OpenAiClientError',
      code: 'generation_error',
      message: 'generation failed',
    })
  })
})

describe('parseSseChatStream', () => {
  it('yields nothing for null body', async () => {
    const parts: string[] = []
    for await (const t of parseSseChatStream(null)) parts.push(t)
    expect(parts).toEqual([])
  })
})
