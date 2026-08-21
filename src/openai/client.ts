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

/** Derive service root (… without trailing /v1) for /health and /hello. */
export function serviceRootFromApiBase(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl)
  return base.endsWith('/v1') ? base.slice(0, -3) : base
}

export type OmoservHealth = {
  ok: boolean
  service?: string
  port?: number
  model_ready: boolean
  llm_ready: boolean
  backend: string
  stt_ready?: boolean
  stt_backend?: string
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

export type ModelInfo = {
  id: string
  owned_by?: string
  created?: number
  model_ready?: boolean
  llm_ready?: boolean
  backend?: string
}

export function createOpenAiClient(config: OpenAiClientConfig) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const serviceRoot = serviceRootFromApiBase(baseUrl)
  const fetchImpl = config.fetchImpl ?? fetch

  return {
    async getHealth(): Promise<OmoservHealth> {
      let res: Response
      try {
        res = await fetchImpl(`${serviceRoot}/health`, { method: 'GET' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'network error'
        throw new OpenAiClientError(0, message, 'network_error')
      }
      if (!res.ok) throw await readError(res)
      const body = (await res.json()) as Partial<OmoservHealth>
      return {
        ok: body.ok === true,
        service: body.service,
        port: body.port,
        model_ready: body.model_ready === true,
        llm_ready: body.llm_ready === true,
        backend: typeof body.backend === 'string' ? body.backend : 'unknown',
        stt_ready: body.stt_ready === true,
        stt_backend: typeof body.stt_backend === 'string' ? body.stt_backend : undefined,
      }
    },

    async listModels(): Promise<ModelInfo[]> {
      const res = await fetchImpl(`${baseUrl}/models`, {
        method: 'GET',
        headers: authHeaders(config.token),
      })
      if (!res.ok) throw await readError(res)
      const body = (await res.json()) as { data?: ModelInfo[] }
      return (body.data ?? []).map((m) => {
        const info: ModelInfo = { id: m.id }
        if (m.owned_by !== undefined) info.owned_by = m.owned_by
        if (m.created !== undefined) info.created = m.created
        if (m.model_ready !== undefined) info.model_ready = m.model_ready
        if (m.llm_ready !== undefined) info.llm_ready = m.llm_ready
        if (m.backend !== undefined) info.backend = m.backend
        return info
      })
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

    /** OpenAI-compatible audio transcriptions (multipart). */
    async createTranscription(params: {
      file: Blob
      filename?: string
      model?: string
      language?: string
    }): Promise<{ text: string }> {
      const form = new FormData()
      form.append('file', params.file, params.filename ?? 'audio.wav')
      form.append('model', params.model ?? 'omoserv-os-stt')
      if (params.language) form.append('language', params.language)

      const res = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
        body: form,
      })
      if (!res.ok) throw await readError(res)
      const body = (await res.json()) as { text?: string }
      return { text: typeof body.text === 'string' ? body.text : '' }
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
