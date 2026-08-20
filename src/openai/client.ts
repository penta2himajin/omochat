export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatCompletionParams = {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
}

export type ChatCompletionChoice = {
  index: number
  message: ChatMessage
  finish_reason: string | null
}

export type ChatCompletionResponse = {
  id: string
  object: 'chat.completion'
  model: string
  choices: ChatCompletionChoice[]
}

export type ChatCompletionChunk = {
  id: string
  object: 'chat.completion.chunk'
  choices: Array<{
    index: number
    delta: { role?: string; content?: string }
    finish_reason: string | null
  }>
}

export type OpenAiClientConfig = {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
}

export class OpenAiClientError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'OpenAiClientError'
    this.status = status
    this.code = code
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8',
  }
}

async function readError(res: Response): Promise<OpenAiClientError> {
  let message = res.statusText || `HTTP ${res.status}`
  let code: string | undefined
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } }
    if (body.error?.message) message = body.error.message
    if (body.error?.code) code = body.error.code
  } catch {
    // ignore non-JSON error bodies
  }
  return new OpenAiClientError(res.status, message, code)
}

/** Parse OpenAI-compatible SSE stream into text deltas. */
export async function* parseSseChatStream(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<string> {
  if (!body) return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''

    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const chunk = JSON.parse(payload) as ChatCompletionChunk & {
          error?: { message?: string; code?: string }
        }
        if (chunk.error?.message) {
          throw new OpenAiClientError(500, chunk.error.message, chunk.error.code)
        }
        const text = chunk.choices?.[0]?.delta?.content
        if (typeof text === 'string' && text.length > 0) yield text
      } catch (err) {
        if (err instanceof OpenAiClientError) throw err
        // skip malformed SSE lines
      }
    }
  }
}

export function createOpenAiClient(config: OpenAiClientConfig) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const fetchImpl = config.fetchImpl ?? fetch

  return {
    async listModels(): Promise<{ id: string }[]> {
      const res = await fetchImpl(`${baseUrl}/models`, {
        method: 'GET',
        headers: authHeaders(config.token),
      })
      if (!res.ok) throw await readError(res)
      const body = (await res.json()) as { data?: Array<{ id: string }> }
      return (body.data ?? []).map((m) => ({ id: m.id }))
    },

    async createChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: authHeaders(config.token),
        body: JSON.stringify({ ...params, stream: false }),
      })
      if (!res.ok) throw await readError(res)
      return (await res.json()) as ChatCompletionResponse
    },

    async *streamChatCompletion(params: ChatCompletionParams): AsyncGenerator<string> {
      let res: Response
      try {
        res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: authHeaders(config.token),
          body: JSON.stringify({ ...params, stream: true }),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'network error'
        throw new OpenAiClientError(0, message, 'network_error')
      }
      if (!res.ok) throw await readError(res)
      try {
        yield* parseSseChatStream(res.body)
      } catch (err) {
        if (err instanceof OpenAiClientError) throw err
        const message = err instanceof Error ? err.message : 'network error'
        throw new OpenAiClientError(0, message, 'network_error')
      }
    },
  }
}

export type OpenAiClient = ReturnType<typeof createOpenAiClient>
